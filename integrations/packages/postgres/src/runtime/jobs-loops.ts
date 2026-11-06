/**
 * Background loops of the jobs runtime: the scheduler pass and, for processes
 * that run attempts without the generated server's job loop, worker loops that
 * lease, execute and settle runs. Loops are forked into the connection owner,
 * log and survive transient failures, and stop when the runtime closes.
 */
import type { OperationContext, TaskExecutor } from "relkit/jobs/adapter";
import { Effect } from "effect";
import type { PostgresDatabase } from "./database.types.js";
import type { PostgresJobWorker } from "./jobs-worker.js";
import { tickSchedules } from "./schedules-tick.js";

/**
 * Builds the operation context used by loops that run outside a request.
 * @param service - Jobs service.
 * @param signal - Loop cancellation.
 * @returns A context for worker calls.
 */
export function loopContext(service: string, signal: AbortSignal): OperationContext {
  return {
    signal,
    application: "relkit",
    environment: "runtime",
    scope: "default",
    service,
    serviceGeneration: "postgres",
  };
}

/**
 * Leases and executes at most one run, settling it through the worker.
 * @param worker - Pull worker.
 * @param executor - Task executor.
 * @param context - Worker operation context.
 * @returns True when a run was executed.
 */
export async function processNextRun(
  worker: PostgresJobWorker,
  executor: TaskExecutor,
  context: OperationContext,
): Promise<boolean> {
  const work = await worker.next(context);
  if (work === undefined) return false;
  try {
    const output = await executor.execute(work.envelope, work.binding);
    await worker.complete(work.envelope.runId, output, context);
  } catch (error) {
    await worker.fail(work.envelope.runId, error, context);
  }
  return true;
}

/**
 * Forks the scheduler loop.
 * @param database - Connection owner.
 * @param service - Jobs service.
 * @param claimant - Instance identity recorded on claims.
 * @param pollIntervalMs - Delay between passes.
 * @returns The forked fiber.
 */
export function forkScheduler(
  database: PostgresDatabase,
  service: string,
  claimant: string,
  pollIntervalMs: number,
) {
  const pass = tickSchedules(database.tables, service, claimant).pipe(
    Effect.tap((claimed) =>
      claimed.length === 0
        ? Effect.void
        : Effect.logInfo("Postgres schedule occurrences enqueued").pipe(
            Effect.annotateLogs({ service, occurrences: claimed.length }),
          ),
    ),
    Effect.catch((error) =>
      Effect.logWarning("Postgres scheduler pass failed").pipe(
        Effect.annotateLogs({ service, operation: error.operation }),
      ),
    ),
  );
  return database.fork(
    Effect.forever(Effect.andThen(pass, Effect.sleep(pollIntervalMs))).pipe(Effect.asVoid),
  );
}

/**
 * Forks one worker loop that keeps executing runs and sleeps when idle.
 * @param database - Connection owner.
 * @param step - Runs one attempt; resolves true when work was found.
 * @param pollIntervalMs - Idle delay.
 * @returns The forked fiber.
 */
export function forkWorkerLoop(
  database: PostgresDatabase,
  step: (signal: AbortSignal) => Promise<boolean>,
  pollIntervalMs: number,
) {
  const once = Effect.tryPromise({
    try: (signal) => step(signal),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("Postgres worker step failed").pipe(
        Effect.annotateLogs({ cause: describeFailure(cause) }),
        Effect.as(false),
      ),
    ),
    Effect.flatMap((ran) => (ran ? Effect.void : Effect.sleep(pollIntervalMs))),
  );
  return database.fork(Effect.forever(once).pipe(Effect.asVoid));
}

/**
 * Renders a failure and its driver cause for logs without bound values.
 * @param cause - Rejection of a worker step.
 * @returns Message text such as `jobs.lease failed: PgConnection: Failed to connect`.
 */
function describeFailure(cause: Error | object | string | undefined): string {
  if (!(cause instanceof Error)) return String(cause);
  const inner = (cause as Error & { readonly cause?: Error }).cause;
  return inner instanceof Error ? `${cause.message}: ${inner.message}` : cause.message;
}
