/** Proves actual external packed UI/history assets, runner behavior and independent CLI installation. */
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import {
  standaloneProbeFixture,
  installStandaloneProbe,
  standaloneProbeLayer,
} from "./standalone-inspector-probe-fixture.js";
import { ScaffoldProcess } from "./scaffold-process.js";
import { scaffoldNative } from "./scaffold-native.js";
import { inspectInstallation } from "./consumer-installation.js";
import { dependencyViolations } from "./consumer-dependency-policy.js";
import { command } from "./release-check-support.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { runPackedTool } from "./standalone-inspector-probe-runtime.js";

const candidateSchema = Schema.Struct({
  packages: Schema.Array(
    Schema.Struct({ name: Schema.String, version: Schema.String, sha256: Schema.String }),
  ),
});

/** Inspects the real CLI closure, with zero final-policy exceptions. */
const verifyCliClosure = Effect.fn("StandaloneProbe.cliClosure")(function* (
  fixture: { directory: string; registry: string },
  version: string,
) {
  const directory = yield* installStandaloneProbe(fixture, "@relkit/cli", version);
  const installation = yield* inspectInstallation(directory);
  assert.deepEqual(installation.missing, []);
  assert.deepEqual(
    dependencyViolations(installation.paths, { stage: "final", exceptions: [] }),
    [],
  );
  return installation;
});

/** Exact candidate input, external install, real UI/history, cache removal, restart and uninstall proof. */
const verifyStandaloneInspector = Effect.fn("StandaloneProbe.run")(function* (
  artifacts: string,
  report: string,
) {
  const fixture = yield* standaloneProbeFixture(artifacts);
  const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(candidateSchema))(
    yield* scaffoldNative("standalone.candidate", () =>
      readFile(join(artifacts, "manifest.json"), "utf8"),
    ),
  );
  const toolVersion = manifest.packages.find((item) => item.name === "@relkit/inspector")!.version;
  const cliVersion = manifest.packages.find((item) => item.name === "@relkit/cli")!.version;
  const directory = yield* installStandaloneProbe(fixture, "@relkit/inspector", toolVersion);
  yield* verifyRunners(directory);
  yield* fixture.capture.append({
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "info",
    component: "app",
    message: "external packed record",
    fields: { password: "synthetic-private-password" },
  });
  const first = yield* Effect.scoped(
    runPackedTool(directory, fixture.project, fixture.connection.descriptor.token),
  );
  yield* scaffoldNative("standalone.runner-cache-remove", () =>
    rm(join(fixture.directory, "package-cache"), { recursive: true, force: true }),
  );
  const second = yield* Effect.scoped(
    runPackedTool(directory, fixture.project, fixture.connection.descriptor.token),
  );
  assert.equal(first.history, second.history);
  yield* scaffoldNative("standalone.uninstall", () =>
    rm(join(directory, "node_modules/@relkit/inspector"), { recursive: true, force: true }),
  );
  assert.equal(
    yield* Effect.promise(() =>
      fetch(`${fixture.backend}/hello`).then((response) => response.text()),
    ),
    "independent backend",
  );
  const cli = yield* verifyCliClosure(fixture, cliVersion);
  yield* writeReport(report, manifest, cli);
  yield* Effect.logInfo(`Standalone inspector external proof passed: ${report}`);
});

/** Tests only the locally installed binary and never downloads a runner package. */
const verifyRunners = Effect.fn("StandaloneProbe.runners")(function* (directory: string) {
  const process = yield* ScaffoldProcess;
  assert(
    (yield* process.run({
      args: ["x", "--no-install", "relkit-inspector", "--help"],
      cwd: directory,
    })).includes("Usage: relkit-inspector"),
  );
  assert(
    (yield* scaffoldNative("standalone.npx", () =>
      command("npx", ["--no-install", "relkit-inspector", "--help"], directory, 30_000),
    )).includes("Usage: relkit-inspector"),
  );
});

/** Writes candidate identities and measured physical installation evidence. */
const writeReport = (
  report: string,
  manifest: typeof candidateSchema.Type,
  cli: Effect.Success<ReturnType<typeof verifyCliClosure>>,
) =>
  scaffoldNative("standalone.report", async () => {
    await mkdir(report, { recursive: true });
    await writeFile(
      join(report, "result.json"),
      JSON.stringify(
        {
          candidate: manifest,
          externalIsolated: true,
          runners: ["bunx --no-install", "npx --no-install"],
          preservedHistory: true,
          cli,
        },
        null,
        2,
      ) + "\n",
    );
  });

if (import.meta.main) {
  const [artifacts, report] = process.argv.slice(2);
  if (!artifacts || !report)
    throw new Error(
      "Usage: bun scripts/verify-standalone-inspector.ts <artifacts> <report-directory>",
    );
  await runBenchmarkMain(
    verifyStandaloneInspector(resolve(artifacts), resolve(report)).pipe(
      Effect.scoped,
      Effect.provide(standaloneProbeLayer),
    ),
  );
}
