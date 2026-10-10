/**
 * Acquires a literal Bun development command in a new owned process group.
 * Output is retained within 64 KiB for failed-start diagnosis. Scope release
 * terminates the complete group and joins exit so sequential samples cannot
 * accidentally measure a server retained from an earlier invocation.
 */
import { spawn } from "node:child_process";
import { Effect, Option } from "effect";
import { ReadinessBenchmarkError } from "./benchmark-error.js";
import { joinBenchmarkGroup } from "./benchmark-process-group.js";
import type { BenchmarkChild, StartRequest } from "./benchmark.types.js";

/**
 * Spawns and owns the command; release completes before the sample settles.
 * @param request - Project and environment for the literal `bun dev` launch.
 * @returns A scoped child observation handle or a typed acquisition failure.
 */
export const startBenchmarkChild = Effect.fn("ReadinessBenchmark.startChild")(function* (
  request: StartRequest,
) {
  const owned = yield* Effect.acquireRelease(
    Effect.try({
      try: () => spawnOwned(request),
      catch: (cause) =>
        new ReadinessBenchmarkError({
          operation: "spawn",
          cause: new Error("Cannot launch bun dev", { cause }),
        }),
    }),
    (owned) => releaseBenchmarkChild(owned).pipe(Effect.catchCause((cause) => Effect.die(cause))),
  );
  return {
    exitCode: () => Effect.sync(() => owned.code()),
    output: () => Effect.sync(() => owned.output()),
  } satisfies BenchmarkChild;
});

/**
 * Installs native listeners before asynchronous process events can fire.
 * @param request - Valid project launch and inherited environment.
 * @returns The physical process and bounded observations owned by the caller.
 */
function spawnOwned(request: StartRequest) {
  const child = spawn("bun", ["dev"], {
    cwd: request.projectRoot,
    env: { ...request.environment },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let code: number | undefined;
  let output: Buffer = Buffer.alloc(0);
  const capture = (chunk: Buffer) => {
    output = Buffer.concat([output, chunk]).subarray(-65_536);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exited = new Promise<void>((resolve) => {
    child.once("error", (error) => {
      output = Buffer.from(error.message).subarray(-65_536);
      code = 1;
      resolve();
    });
    child.once("exit", (value) => {
      code = value ?? 1;
      resolve();
    });
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return { child, exited, closed, code: () => code, output: () => output.toString("utf8") };
}

/**
 * Reaps the child and terminates its group, including independently spawned web work.
 * @param owned - Physical process acquired by this measurement only.
 * @returns Joined cleanup or a typed failure if native termination cannot finish.
 */
const releaseBenchmarkChild = Effect.fn("ReadinessBenchmark.releaseChild")(function* (
  owned: ReturnType<typeof spawnOwned>,
) {
  yield* reapBenchmarkLeader(owned).pipe(
    Effect.onExit(() => joinBenchmarkGroup(owned.child.pid)),
    Effect.ensuring(
      Effect.promise(() => owned.closed).pipe(
        Effect.timeoutOption(1_000),
        Effect.ensuring(
          Effect.sync(() => {
            owned.child.stdout.destroy();
            owned.child.stderr.destroy();
          }),
        ),
      ),
    ),
  );
});

/**
 * Joins the measured leader and reports any forced shutdown as failed acceptance.
 * @param owned - Measurement-owned process whose group is drained by its caller.
 * @returns Physical leader settlement or typed bounded-shutdown failure.
 */
const reapBenchmarkLeader = Effect.fn("ReadinessBenchmark.reapLeader")(function* (
  owned: ReturnType<typeof spawnOwned>,
) {
  yield* signalBenchmarkGroup(owned, "SIGTERM");
  const closed = yield* Effect.promise(() => owned.exited).pipe(Effect.timeoutOption(5_000));
  if (Option.isNone(closed)) {
    yield* signalBenchmarkGroup(owned, "SIGKILL");
    yield* Effect.promise(() => owned.exited).pipe(Effect.timeoutOption(1_000));
    return yield* new ReadinessBenchmarkError({
      operation: "reap",
      cause: new Error("Development shutdown exceeded five seconds"),
    });
  }
});

/**
 * Signals only the freshly detached measurement group and accepts absence alone.
 * @param owned - Physical process acquired by this sample.
 * @param signal - Bounded graceful or forced release phase.
 * @returns Completion or typed native failure, preserving mixed Cause siblings.
 */
const signalBenchmarkGroup = Effect.fn("ReadinessBenchmark.signalGroup")(
  (owned: ReturnType<typeof spawnOwned>, signal: "SIGTERM" | "SIGKILL") =>
    Effect.try({
      try: () => {
        if (process.platform === "win32") owned.child.kill(signal);
        else if (owned.child.pid !== undefined) process.kill(-owned.child.pid, signal);
      },
      catch: (cause) =>
        new ReadinessBenchmarkError({
          operation: "terminate",
          cause: new Error("Cannot terminate measured process group", { cause }),
        }),
    }).pipe(
      Effect.catchCause((cause) => {
        const reason = cause.reasons[0];
        const original = reason?._tag === "Fail" ? reason.error.cause.cause : undefined;
        if (
          cause.reasons.length === 1 &&
          original instanceof Error &&
          "code" in original &&
          original.code === "ESRCH"
        )
          return Effect.void;
        return Effect.failCause(cause);
      }),
    ),
);
