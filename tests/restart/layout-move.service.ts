/** Owns native restart probes, process groups and persistent state while moving a complete service boundary. */
import { mkdtemp, mkdir, rename, rm, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { scaffoldChild } from "../../scripts/scaffold-process.js";
import { ScaffoldProcessFailure } from "../../scripts/scaffold-process.errors.js";
import { copyRestartSource } from "./layout-move.sources.js";
import { RestartAgentReport } from "./layout-move.schemas.js";

const repository = resolve(import.meta.dir, "../..");

/** Native probe authority and source root belong to the caller's retained Effect scope. */
export class RestartLayout extends Context.Service<RestartLayout>()("relkit.tests.RestartLayout", {
  make: Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      scaffoldNative("restart.layout.root", () => mkdtemp(join(tmpdir(), "relkit-restart-jobs-"))),
      (root) =>
        scaffoldNative("restart.layout.release", () =>
          rm(root, { recursive: true, force: true }),
        ).pipe(Effect.orDie),
    );
    yield* prepareSources(root);
    return {
      root,
      worker: runWorker,
      move: moveSources(root),
      read: (path: string) =>
        scaffoldNative("restart.layout.read", () => readFile(join(root, path), "utf8")),
      write: (path: string, content: string) =>
        scaffoldNative("restart.layout.write", () => writeFile(join(root, path), content)),
    };
  }),
}) {}
export const restartLayoutLayer = Layer.effect(RestartLayout, RestartLayout.make);

/**
 * Copies the complete native probe boundary without changing public descriptors, checkpoint logic or durable IDs.
 * @param root - Exclusive source/state root.
 * @returns Joined copies of both workers and their service-local helpers.
 */
const prepareSources = Effect.fn("RestartLayout.prepare")(function* (root: string) {
  const destination = join(root, "src/jobs");
  yield* scaffoldNative("restart.layout.manifest", () =>
    writeFile(join(root, "package.json"), '{"type":"module"}\n'),
  );
  yield* scaffoldNative("restart.layout.directory", () => mkdir(destination, { recursive: true }));
  yield* scaffoldNative("restart.layout.modules", () =>
    symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir"),
  );
  for (const file of [
    "jobs-worker.ts",
    "agent-graph-worker.ts",
    "agent-graph-fixture.ts",
    "state-root.ts",
    "layout-move-effect-mq-worker.ts",
  ])
    yield* copyRestartSource(join(repository, "tests/restart", file), join(destination, file));
});

/**
 * Moves all authored probe sources together while retaining checkpoint and job state at their original root.
 * @param root - Exclusive application/state root.
 * @returns A joined whole-boundary move; state files are never read or rewritten by this operation.
 */
const moveSources = Effect.fn("RestartLayout.move")((root: string) =>
  scaffoldNative("restart.layout.move", async () => {
    await mkdir(join(root, "src/services"));
    await rename(join(root, "src/jobs"), join(root, "src/services/jobs"));
  }),
);

/**
 * Runs the original native probe at its actual flat or grouped physical path.
 * @param root - Exclusive source and persistent-state root.
 * @param grouped - Whether the whole boundary has moved.
 * @param kind - Native job, Node/SQLite agent or PostgreSQL schedule probe.
 * @param args - Original worker's exact native arguments after its state root.
 * @param environment - Explicit invocation-only provider configuration.
 * @returns Exit and fully joined bounded output; SIGKILL is retained as a nonzero outcome.
 */
const runWorker = Effect.fn("RestartLayout.worker")(
  function* (
    root: string,
    grouped: boolean,
    kind: "job" | "agent" | "effect-mq",
    args: readonly string[],
    environment?: Readonly<Record<string, string>>,
  ) {
    const agent = kind === "agent";
    let workerName = "jobs-worker.ts";
    if (agent) workerName = "agent-graph-worker.ts";
    else if (kind === "effect-mq") workerName = "layout-move-effect-mq-worker.ts";
    const worker = join(root, grouped ? "src/services/jobs" : "src/jobs", workerName);
    const mode = args[0];
    if (!mode)
      return yield* new ScaffoldProcessFailure({
        operation: "restart.arguments",
        message: "Native worker mode is required",
      });
    const child = yield* scaffoldChild({
      cwd: repository,
      ...(environment === undefined ? {} : { env: environment }),
      executable: agent ? "node" : "bun",
      args: [
        ...(agent
          ? [join(repository, "node_modules/.bun/node_modules/tsx/dist/cli.mjs")]
          : ["run"]),
        worker,
        mode,
        root,
        ...args.slice(1),
      ],
    });
    const [exit, output, errors] = yield* Effect.promise(() => child.settled);
    if (
      exit.status !== "fulfilled" ||
      output.status !== "fulfilled" ||
      errors.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: "restart.settlement",
        message: "Native restart worker did not settle",
      });
    return { exitCode: exit.value, output: output.value, errors: errors.value };
  },
  (effect) =>
    observeExecution(
      "testing",
      "restart.layout.worker",
      effect.pipe(Effect.scoped, Effect.timeout("30 seconds")),
    ),
);

/**
 * Decodes the final public agent observation after the native process has exited.
 * @param output - Complete bounded native standard output.
 * @returns Validated native lifecycle and transcript fields.
 */
export function restartAgentReport(output: string) {
  const line = output.trim().split("\n").filter(Boolean).at(-1);
  return Schema.decodeUnknownEffect(Schema.fromJsonString(RestartAgentReport))(line);
}
