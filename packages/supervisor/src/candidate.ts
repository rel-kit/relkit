import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { CandidatePlatformLive } from "./candidate-platform.js";
import { createCandidateLayer, SupervisorCandidate } from "./candidate-service.js";
import type { CandidateOptions, CompiledCandidate, StartedCandidate } from "./candidate.types.js";
export type * from "./candidate.types.js";

export const DEFAULT_CANDIDATE_GENERATED_DIRECTORY = ".relkit/generated";
export const DEFAULT_CANDIDATE_OUTPUT_BYTES = 8 * 1024;
export const DEFAULT_CANDIDATE_STOP_TIMEOUT_MS = 1_000;

/**
 * Compiles into an exclusive generation directory owned until cleanup.
 * @param options - Source identity, native compiler and explicit output policy.
 * @returns Compiled paths; cleanup closes this generation's directory scope.
 * @example
 * ```ts
 * import { compileCandidate } from "@relkit/supervisor";
 * import type { CandidateOptions } from "@relkit/supervisor";
 * export async function compile(options: CandidateOptions): Promise<void> {
 *   const compiled = await compileCandidate(options);
 *   try { console.log(compiled.entrypoint); }
 *   finally { await compiled.cleanup(); }
 * }
 * ```
 */
export async function compileCandidate(options: CandidateOptions): Promise<CompiledCandidate> {
  const owner = createOwner(options);
  try {
    const compiled = await runCandidate(
      owner,
      Effect.flatMap(SupervisorCandidate, (service) => service.compile),
      options.signal,
    );
    let closing: Promise<void> | undefined;
    return Object.freeze({ ...compiled, cleanup: () => (closing ??= closeOwner(owner)) });
  } catch (error) {
    await closeOwner(owner).catch(() => undefined);
    throw error;
  }
}

/**
 * Starts a candidate without changing the active generation.
 * @param options - Source identity, native compiler and bounded process policy.
 * @returns An owned process; stop joins native exit, cleanup removes its directory,
 * and dispose performs both and joins output workers.
 * @example
 * ```ts
 * import { startCandidate } from "@relkit/supervisor";
 * import type { CandidateOptions } from "@relkit/supervisor";
 * export async function start(options: CandidateOptions): Promise<void> {
 *   const candidate = await startCandidate(options);
 *   try { await candidate.exited; }
 *   finally { await candidate.dispose(); }
 * }
 * ```
 */
export async function startCandidate(options: CandidateOptions): Promise<StartedCandidate> {
  const owner = createOwner(options);
  try {
    const candidate = await runCandidate(
      owner,
      Effect.flatMap(SupervisorCandidate, (service) => service.start),
      options.signal,
    );
    let closing: Promise<void> | undefined;
    return Object.freeze({ ...candidate, dispose: () => (closing ??= closeOwner(owner)) });
  } catch (error) {
    await closeOwner(owner).catch(() => undefined);
    throw error;
  }
}

/** Acquires one generation owner, with no native work before compile/start.
 * @param options - Dependencies and sinks. @returns One reused service runtime.
 */
function createOwner(options: CandidateOptions) {
  return ManagedRuntime.make(
    Layer.mergeAll(
      createCandidateLayer(options).pipe(Layer.provide(CandidatePlatformLive)),
      createLoggerLayer({ component: "supervisor", ...options.operationLogger }),
      Layer.succeed(Metric.MetricRegistry, new Map()),
    ),
  );
}

/** Preserves public rejection identity after the service has observed the complete Cause.
 * @typeParam A - Public result. @param owner - Reused generation owner.
 * @param effect - Domain work. @param signal - Caller cancellation, never aborted by the owner.
 * @returns Its original result or rejection.
 */
async function runCandidate<A>(
  owner: ReturnType<typeof createOwner>,
  effect: Effect.Effect<A, unknown, SupervisorCandidate>,
  signal: AbortSignal | undefined,
): Promise<A> {
  const exit = await owner.runPromiseExit(effect, signal === undefined ? undefined : { signal });
  if (Exit.isSuccess(exit)) return exit.value;
  if (signal?.aborted && Cause.hasInterruptsOnly(exit.cause))
    throw signal.reason ?? new Error("Candidate operation was aborted.");
  throw Cause.squash(exit.cause);
}

/** Joins generation release without exposing a FiberFailure wrapper.
 * @param owner - Candidate service lifetime. @returns Released native prefix and workers.
 */
async function closeOwner(owner: ReturnType<typeof createOwner>): Promise<void> {
  const exit = await Effect.runPromiseExit(owner.disposeEffect);
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
}
