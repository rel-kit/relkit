/**
 * Pull worker for the Postgres jobs backend. `next` claims one due run with a
 * fresh owner token and starts a heartbeat fiber that extends the lease every
 * third of its duration; the heartbeat aborts the attempt's signal when a
 * cancellation is requested or the lease is lost. `complete` and `fail` stop
 * the heartbeat and settle fenced on the owner token. Closing the worker stops
 * heartbeats without settling, which is exactly what a crash looks like to the
 * database: the lease expires and another worker retries the run.
 */
import { randomUUID } from "node:crypto";
import type { JsonValue } from "relkit/contracts";
import type { NativeTaskWorker } from "relkit/jobs/adapter";
import { Effect, Fiber } from "effect";
import type { BackgroundFiber, PostgresDatabase } from "./database.types.js";
import { completeRun, failRun, heartbeatRun, leaseRun } from "./jobs-lease.js";
import { bindingOf, envelopeOf } from "./jobs-work.js";

/** One attempt this worker holds. */
interface ActiveLease {
  readonly owner: string;
  readonly controller: AbortController;
  readonly heartbeat: BackgroundFiber;
}

/** Pull worker plus a close operation for its heartbeats. @experimental */
export interface PostgresJobWorker extends NativeTaskWorker {
  /** Stops heartbeats without settling held runs; their leases then expire. */
  readonly close: () => Promise<void>;
  /** Runs currently leased by this worker. */
  readonly active: () => readonly string[];
}

/**
 * Creates the pull worker for one jobs service.
 * @param database - Connection owner that also runs the heartbeat fibers.
 * @param options - Service, lease duration and worker identity prefix.
 * @returns The worker used by the server's job loop.
 * @experimental
 */
export function createPostgresJobWorker(
  database: PostgresDatabase,
  options: { readonly service: string; readonly leaseMs: number; readonly workerId: string },
): PostgresJobWorker {
  const tables = database.tables;
  const leases = new Map<string, ActiveLease>();
  const release = async (runId: string) => {
    const lease = leases.get(runId);
    leases.delete(runId);
    if (lease !== undefined) await Effect.runPromise(Fiber.interrupt(lease.heartbeat));
    return lease;
  };
  const worker: PostgresJobWorker = {
    next: async (context) => {
      if (context.signal.aborted) return undefined;
      const owner = `${options.workerId}:${randomUUID()}`;
      const row = await database.run(
        leaseRun(tables, options.service, owner, options.leaseMs),
        context.signal,
      );
      if (row === undefined) return undefined;
      const controller = new AbortController();
      const heartbeat = database.fork(
        heartbeatLoop(database, row.run_id, owner, options.leaseMs, controller),
      );
      leases.set(row.run_id, { owner, controller, heartbeat });
      return { envelope: envelopeOf(row), binding: bindingOf(row, controller.signal, context) };
    },
    complete: async (runId, output) => {
      const lease = await release(runId);
      if (lease === undefined) return;
      await database.run(completeRun(tables, runId, lease.owner, output as JsonValue | undefined));
    },
    fail: async (runId, error) => {
      const lease = await release(runId);
      await database.run(failRun(tables, runId, lease?.owner, error as Error));
    },
    close: async () => {
      const held = [...leases.values()];
      leases.clear();
      await Effect.runPromise(Fiber.interruptAll(held.map((lease) => lease.heartbeat)));
    },
    active: () => [...leases.keys()],
  };
  return Object.freeze(worker);
}

/**
 * Extends the lease until interrupted; transient SQL failures are retried on the next beat.
 * @param database - Connection owner.
 * @param runId - Leased run.
 * @param owner - Owner token.
 * @param leaseMs - Lease duration.
 * @param controller - Attempt controller aborted on cancellation or lease loss.
 * @returns A never-failing loop.
 */
function heartbeatLoop(
  database: PostgresDatabase,
  runId: string,
  owner: string,
  leaseMs: number,
  controller: AbortController,
) {
  return Effect.gen(function* () {
    const interval = Math.max(5, Math.floor(leaseMs / 3));
    while (true) {
      yield* Effect.sleep(interval);
      const outcome = yield* heartbeatRun(database.tables, runId, owner, leaseMs).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("Postgres lease heartbeat failed").pipe(
            Effect.annotateLogs({ runId, operation: error.operation }),
          ),
        ),
        Effect.orElseSucceed(() => "held" as const),
      );
      if (outcome === "cancel-requested") controller.abort(new Error("Run cancellation requested"));
      if (outcome === "lost") {
        yield* Effect.logWarning("Postgres lease lost").pipe(Effect.annotateLogs({ runId }));
        controller.abort(new Error("Run lease was lost"));
        return;
      }
    }
  });
}
