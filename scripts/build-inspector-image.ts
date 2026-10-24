/** Builds the dedicated image with a run-owned one-CPU/768-MiB builder. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Effect } from "effect";
import { createBuilder, docker } from "./tests/server-runtime/production-docker-owner.js";
import { scaffoldNative } from "./scaffold-native.js";

export const buildInspectorImage = Effect.fn("InspectorImage.build")(function* (
  image: string,
  input = ".relkit/inspector-image",
) {
  if (!/^\.relkit\/inspector-image(?:-[a-zA-Z0-9-]+)?$/.test(input))
    return yield* Effect.fail(
      new Error("Image input must be an owned .relkit/inspector-image directory"),
    );
  const owner = {
    builder: `relkit-inspector-${randomUUID()}`,
    image,
    container: "unused",
    builderCreated: false,
  };
  yield* Effect.addFinalizer(() =>
    owner.builderCreated
      ? scaffoldNative("image.builder-close", () =>
          docker(["buildx", "rm", "--force", owner.builder]),
        ).pipe(Effect.orDie)
      : Effect.void,
  );
  const existing = yield* scaffoldNative("image.previous", () =>
    docker(["image", "ls", "--quiet", "--filter", `reference=${image}`]),
  );
  if (existing)
    return yield* Effect.fail(new Error("Image tag already exists; choose a fresh build tag"));
  yield* scaffoldNative("image.builder", () => createBuilder(owner));
  yield* scaffoldNative("image.build", () =>
    docker([
      "buildx",
      "build",
      "--builder",
      owner.builder,
      "--load",
      "--provenance=false",
      "--build-arg",
      `INSPECTOR_IMAGE_INPUT=${input}`,
      "--file",
      "packages/inspector/Dockerfile",
      "--tag",
      image,
      resolve(import.meta.dir, ".."),
    ]),
  );
  const identity = yield* scaffoldNative("image.identity", () =>
    docker(["image", "inspect", "--format", "{{.Id}} {{.Architecture}} {{.Config.User}}", image]),
  );
  console.log(JSON.stringify({ image, identity, builderCpu: 1, builderMemory: 805306368 }));
});

if (import.meta.main)
  await Effect.runPromise(
    buildInspectorImage(process.argv[2] ?? "relkit-inspector:local", process.argv[3]).pipe(
      Effect.scoped,
    ),
  );
