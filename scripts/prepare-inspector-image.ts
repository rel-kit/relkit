/** Stages checksum-verified candidate archives; application source never enters the image context. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect, Exit } from "effect";
import { inspectorImageInput } from "./inspector-image-input.js";
import { scaffoldNative } from "./scaffold-native.js";

export const prepareInspectorImage = Effect.fn("InspectorImage.prepare")(function* (
  artifacts: string,
  output: string,
) {
  const input = yield* scaffoldNative("image.manifest", async () =>
    inspectorImageInput(JSON.parse(await readFile(join(artifacts, "manifest.json"), "utf8"))),
  );
  yield* Effect.acquireRelease(
    scaffoldNative("image.directory", () => mkdir(output)),
    (_, exit) =>
      Exit.isFailure(exit)
        ? scaffoldNative("image.partial-close", () =>
            rm(output, { recursive: true, force: true }),
          ).pipe(Effect.orDie)
        : Effect.void,
  );
  yield* scaffoldNative("image.archives", () => mkdir(join(output, "artifacts")));
  for (const item of input.packages)
    yield* scaffoldNative("image.archive", async () => {
      const bytes = await readFile(join(artifacts, item.file));
      if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
        throw new Error(`Candidate checksum mismatch: ${item.name}`);
      await writeFile(join(output, "artifacts", item.file), bytes, { flag: "wx" });
    });
  yield* scaffoldNative("image.install-manifest", async () => {
    await writeFile(join(output, "package.json"), JSON.stringify(input.manifest) + "\n", {
      flag: "wx",
    });
    await writeFile(
      join(output, "candidate.json"),
      JSON.stringify(
        { protocol: "relkit.inspector-image-input.v1", packages: input.packages },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  });
  return output;
});

if (import.meta.main) {
  const artifacts = process.argv[2];
  if (!artifacts)
    throw new TypeError(
      "Usage: prepare-inspector-image <candidate-artifacts> [new-output-directory]",
    );
  const output = resolve(process.argv[3] ?? ".relkit/inspector-image");
  console.log(
    await Effect.runPromise(prepareInspectorImage(resolve(artifacts), output).pipe(Effect.scoped)),
  );
}
