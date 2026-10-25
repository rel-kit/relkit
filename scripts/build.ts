/** Owns release-metadata validation and the complete sequential Turbo build, restoring generated editor declarations after joined child shutdown. */
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { restoreFile, snapshotFile } from "./preserve-build-state.ts";
import { scaffoldChild } from "./scaffold-process.js";
import { scaffoldNative } from "./scaffold-native.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/** Validates metadata before owning editor snapshots and running every native build task.
 * @returns Completion after the build child and Inspector declaration restoration settle. */
const buildWorkspace = Effect.fn("WorkspaceBuild.run")(function* () {
  const root = resolve(import.meta.dir, "..");
  yield* buildStep(root, "metadata", ["run", "scripts/sync-release.ts"]);
  yield* Effect.acquireRelease(
    scaffoldNative("build.snapshot", () =>
      snapshotFile(join(root, "apps/inspector/next-env.d.ts")),
    ),
    (snapshot) => scaffoldNative("build.restore", () => restoreFile(snapshot)).pipe(Effect.orDie),
  );
  yield* buildStep(root, "workspace", ["x", "turbo", "run", "build", "--concurrency=1"]);
  yield* Effect.sync(() => console.log("Workspace build passed."));
});

/** Joins a native metadata/build stage and preserves all output and nonzero outcomes.
 * @param root - Contributor checkout containing the unchanged Turbo task graph.
 * @param stage - Fixed operation identity used by typed failures and instrumentation.
 * @param args - Original native Bun arguments with the explicit task scheduling limit.
 * @returns Completion after child exit and both bounded output streams have settled. */
const buildStep = Effect.fn("WorkspaceBuild.step")(
  function* (root: string, stage: "metadata" | "workspace", args: readonly string[]) {
    const child = yield* scaffoldChild({ cwd: root, args });
    const [exit, output, errors] = yield* Effect.promise(() => child.settled);
    if (
      exit.status !== "fulfilled" ||
      output.status !== "fulfilled" ||
      errors.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: `build.${stage}.settlement`,
        message: "Native build stage did not settle its exit and output",
      });
    yield* Effect.sync(() => {
      process.stdout.write(output.value);
      process.stderr.write(errors.value);
    });
    if (exit.value !== 0)
      return yield* new ScaffoldProcessFailure({
        operation: `build.${stage}.exit`,
        message: `Workspace ${stage} failed with exit code ${exit.value}`,
      });
  },
  (effect) => observeExecution("testing", "workspace.build.stage", effect.pipe(Effect.scoped)),
);

if (import.meta.main) await runBenchmarkMain(buildWorkspace().pipe(Effect.scoped));
