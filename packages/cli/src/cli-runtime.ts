import { Cause, Effect, Layer, ManagedRuntime, type Scope } from "effect";
import { observeExecution, runExecutionPromise } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { cliOriginalError } from "./cli-errors.js";
import { CliCleanup, cleanupLayer } from "./services/cleanup.service.js";
import {
  cliCleanupFailures,
  cliCleanupSnapshotUnsafe,
  retainCliCleanupFailures,
} from "./cli-cleanup-evidence.js";
import type { CleanupCapabilities } from "./services/cleanup.types.js";
import type { CliCleanupPresentation } from "./cli-runtime.types.js";
import { presentCliCleanup } from "./cli-cleanup-presentation.js";

/**
 * Observes one named CLI operation without changing its typed requirements or cause.
 * @typeParam A - Successful operation value.
 * @typeParam E - Expected domain failures.
 * @typeParam R - Required services.
 * @param operation - Bounded declaration-owned operation label.
 * @param effect - Lazy domain work.
 * @param workload - Bounded work counts, evaluated at execution.
 * @returns The original effect with shared CLI observation.
 */
export function observeCli<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  workload: () => Readonly<Record<string, number>> = () => ({}),
): Effect.Effect<A, E, R> {
  return observeExecution("cli", operation, effect, workload);
}

/**
 * Executes a public Promise edge with one acquired service graph and lifetime.
 * @typeParam A - Public success value.
 * @typeParam E - Domain failure preserving its object identity.
 * @typeParam R - Services supplied by this invocation's Layer.
 * @typeParam LE - Layer acquisition failure.
 * @param effect - Lazy domain operation; service methods never execute effects themselves.
 * @param layer - Invocation-owned live or test dependency graph.
 * @param signal - Optional caller cancellation.
 * @param presentation - Selected terminal policy for cleanup diagnostics beside any outcome.
 * @returns The original public result after scoped cleanup completes.
 * @throws The original typed failure, defect, or interruption cause.
 */
export async function runCliEffect<A, E, R, LE>(
  effect: Effect.Effect<A, E, R | Scope.Scope>,
  layer: Layer.Layer<R, LE>,
  signal?: AbortSignal,
  presentation?: CliCleanupPresentation,
): Promise<A> {
  const logging = createLoggerLayer({
    component: "cli",
    human: false,
    json: false,
  });
  const runtime = ManagedRuntime.make(
    Layer.merge(cleanupLayer, layer).pipe(Layer.provideMerge(logging)),
  );
  let cleanup: CleanupCapabilities | undefined;
  let owner: unknown;
  let disposal: unknown;
  try {
    cleanup = await runExecutionPromise(runtime, CliCleanup);
    const value = await runExecutionPromise(
      runtime,
      Effect.scoped(effect).pipe(Effect.mapError(cliOriginalError)),
      signal === undefined ? undefined : { signal },
    );
    owner = value;
    return value;
  } catch (error) {
    owner = signal?.aborted ? signal.reason : error;
    throw error;
  } finally {
    try {
      await runtime.dispose();
    } catch (error) {
      disposal = error;
    }
    const evidence = cleanup ? cliCleanupSnapshotUnsafe(cleanup) : [];
    const receipts =
      disposal === undefined
        ? evidence
        : [...evidence, { operation: "cli.runtime.release", cause: Cause.fail(disposal) }];
    retainCliCleanupFailures(owner, receipts);
    presentCliCleanup(
      cliCleanupFailures(owner).length ? cliCleanupFailures(owner) : receipts,
      presentation,
    );
  }
}
