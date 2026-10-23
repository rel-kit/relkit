/** Runs the packed cache/realtime and real selected deployment mock boundaries serially against mandatory fresh artifacts. */
import assert from "node:assert/strict";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Effect } from "effect";
import { consumerArtifacts } from "../../../scripts/consumer-artifacts.js";
import { preparePackedStorageConsumer } from "../../../scripts/prepare-packed-storage-consumer.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "../../../scripts/scaffold-process.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { packedRedisEndpoint } from "./packed-redis-docker.js";
import { auditPackedMixedClosure, installPackedDeployment } from "./packed-mixed-installation.js";

const repository = resolve(import.meta.dir, "../../..");

/** Copies only authored probes into the external root; executable imports remain public package specifiers. */
const copyProbe = Effect.fn("PackedMixed.copyProbe")((root: string, files: readonly string[]) =>
  scaffoldNative("packed.mixed.sources", () =>
    Promise.all(files.map((file) => cp(join(import.meta.dir, file), join(root, file)))),
  ),
);

/** Proves cache and realtime semantics before releasing the uniquely owned Redis container. */
const runPackedRedis = Effect.fn("PackedMixed.redis")(
  function* (artifacts: string, root: string) {
    yield* preparePackedStorageConsumer(artifacts, root, [
      "redis",
      "compiler",
      "engine",
      "realtime",
    ]);
    const candidate = yield* consumerArtifacts(repository, root, artifacts);
    yield* auditPackedMixedClosure(root, candidate, false);
    yield* copyProbe(root, ["packed-mixed-redis.fixture.ts"]);
    const url = yield* packedRedisEndpoint(root);
    const runner = yield* ScaffoldProcess;
    const output = yield* runner.run({ cwd: root, args: ["packed-mixed-redis.fixture.ts", url] });
    yield* scaffoldNative("packed.redis.result", () =>
      writeFile(join(root, "behavior.log"), output),
    );
    return JSON.parse(output.trim().split("\n").at(-1) ?? "null") as unknown;
  },
  (effect) => effect.pipe(Effect.scoped, Effect.timeout("3 minutes")),
);

/** Resolves actual selected deployment peers and native role exports without a cloud backend. */
const runPackedDeployment = Effect.fn("PackedMixed.deployment")(
  function* (artifacts: string, root: string) {
    const candidate = yield* installPackedDeployment(repository, artifacts, root);
    yield* auditPackedMixedClosure(root, candidate, true);
    yield* copyProbe(root, ["packed-deployment.fixture.ts", "packed-deployment-plan.fixture.ts"]);
    const runner = yield* ScaffoldProcess;
    const output = yield* runner.run({
      cwd: root,
      args: ["packed-deployment.fixture.ts"],
      env: {
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "native-mock",
        AWS_SECRET_ACCESS_KEY: "native-mock",
        AWS_SESSION_TOKEN: "",
      },
    });
    yield* scaffoldNative("packed.deploy.result", () =>
      writeFile(join(root, "behavior.log"), output),
    );
    return JSON.parse(output.trim().split("\n").at(-1) ?? "null") as unknown;
  },
  (effect) => effect.pipe(Effect.scoped, Effect.timeout("3 minutes")),
);

/** Retains both consumer sources, manifests, locks, native observations and failed roots for the gate owner. */
export const runPackedMixedBoundaries = Effect.fn("PackedMixed.acceptance")(function* (
  artifacts: string,
  output: string,
) {
  const location = relative(repository, output);
  assert.ok(
    location === ".." || location.startsWith("../") || isAbsolute(location),
    "Packed output must be outside the repository",
  );
  const redis = join(output, "redis"),
    deployment = join(output, "deployment");
  yield* scaffoldNative("packed.mixed.output", () => mkdir(output));
  yield* scaffoldNative("packed.mixed.roots", () => Promise.all([mkdir(redis), mkdir(deployment)]));
  const mixed = yield* runPackedRedis(artifacts, redis);
  const offline = yield* runPackedDeployment(artifacts, deployment);
  const report = { artifacts, redis: mixed, deployment: offline };
  yield* scaffoldNative("packed.mixed.report", () =>
    writeFile(join(output, "report.json"), JSON.stringify(report, null, 2)),
  );
  return report;
});

if (import.meta.main) {
  const [artifacts, output] = process.argv.slice(2);
  assert.ok(
    artifacts && output,
    "Usage: packed-mixed-boundaries.ts <fresh-candidates> <external-output>",
  );
  const report = await Effect.runPromise(
    runPackedMixedBoundaries(resolve(artifacts), resolve(output)).pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
  process.stdout.write(JSON.stringify(report) + "\n");
}
