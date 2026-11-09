/**
 * Assembles the Postgres jobs adapter: durable submission, reads, cancellation
 * and retry over the job-runs table, a pull worker with leases, persisted
 * schedules with a once-per-occurrence scheduler, and optional in-process
 * worker loops. The generated server drives `worker` from its job loop in the
 * `worker` role and calls `registerWorker`, which starts the scheduler unless
 * the instance runs in the `api` role.
 */
import type { JobsAdapterRuntime } from "relkit/jobs/adapter";
import { Effect, Fiber } from "effect";
import { openPostgresDatabase } from "./database.js";
import type { BackgroundFiber } from "./database.types.js";
import { cancelRun, getRun, listRuns } from "./jobs-controls.js";
import { forkScheduler, forkWorkerLoop, loopContext, processNextRun } from "./jobs-loops.js";
import { observeRun } from "./jobs-observe.js";
import type {
  PostgresJobsRuntime,
  PostgresJobsRuntimeOptions,
  PostgresTaskDefinition,
} from "./jobs-runtime.types.js";
import { retryRun, submitRun, unknownSubmission } from "./jobs-submit.js";
import { createPostgresJobWorker } from "./jobs-worker.js";
import { createScheduleOperations } from "./schedules-store.js";
import { tickSchedules } from "./schedules-tick.js";
export type * from "./jobs-runtime.types.js";

/**
 * Creates the Postgres jobs runtime.
 * @param options - Connection (or shared database), service, lease and polling settings.
 * @returns The adapter; `close()` stops loops and, unless the database was shared, the pool.
 * @throws TypeError when neither `url` nor `database` is given.
 * @example const jobs = createPostgresJobsRuntime({ url: process.env.DATABASE_URL! });
 * @experimental
 */
export function createPostgresJobsRuntime(
  options: PostgresJobsRuntimeOptions,
): PostgresJobsRuntime {
  const database = options.database ?? openOwned(options);
  const service = options.service ?? "postgres";
  const leaseMs = options.leaseMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const workerId = options.workerId ?? `postgres-${crypto.randomUUID().slice(0, 8)}`;
  const tables = database.tables;
  const definitions = new Map<string, PostgresTaskDefinition>();
  const worker = createPostgresJobWorker(database, { service, leaseMs, workerId });
  const loops = new Set<BackgroundFiber>();
  const loopSignal = new AbortController();
  let scheduler: BackgroundFiber | undefined;
  const schedules = createScheduleOperations(database, service, (jobId) => {
    const definition = definitions.get(jobId);
    if (definition === undefined) return undefined;
    return {
      jobId,
      taskId: definition.taskId,
      taskVersion: definition.taskVersion ?? definition.version ?? "1",
      buildId: definition.buildId,
      ...(definition.policy === undefined ? {} : { policy: definition.policy }),
    };
  });
  const startScheduler = () => {
    scheduler ??= forkScheduler(database, service, workerId, pollIntervalMs);
  };
  const adapter: Omit<PostgresJobsRuntime, "registerWorker" | "startWorkers" | "processNext"> = {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1,
    capabilities: capabilities(service),
    database,
    worker,
    schedules,
    submit: async (request, context) => {
      const handle = await database.run(submitRun(tables, request, context), context.signal);
      return options.faults?.loseSubmitResponse === true ? unknownSubmission(request) : handle;
    },
    get: (runId, context) => database.run(getRun(tables, runId, context), context.signal),
    list: (query, context) => database.run(listRuns(tables, query, context), context.signal),
    observe: (request, context) =>
      observeRun(
        (runId, current) => database.run(getRun(tables, runId, current), current.signal),
        request,
        context,
        Math.min(pollIntervalMs, 250),
      ),
    cancel: (request, context) => database.run(cancelRun(tables, request, context), context.signal),
    retry: (request, context) => database.run(retryRun(tables, request, context), context.signal),
    tickSchedules: () => database.run(tickSchedules(tables, service, workerId)),
    startScheduler,
    close: async () => {
      loopSignal.abort();
      await worker.close();
      await Effect.runPromise(Fiber.interruptAll([...loops, ...(scheduler ? [scheduler] : [])]));
      if (options.database === undefined) await database.close();
    },
  };
  const processNext: PostgresJobsRuntime["processNext"] = (executor) =>
    processNextRun(worker, executor, loopContext(service, loopSignal.signal));
  const runtime: PostgresJobsRuntime = {
    ...adapter,
    processNext,
    startWorkers: ({ executor, concurrency = 1 }) => {
      for (let index = 0; index < concurrency; index += 1)
        loops.add(forkWorkerLoop(database, () => processNext(executor), pollIntervalMs));
    },
    registerWorker: (registration) => {
      for (const definition of registration.definitions)
        definitions.set(definition.jobId, definition);
      return Object.freeze({
        definitions: Object.freeze([...registration.definitions]),
        ready: async () => {
          await database.run(Effect.void);
          if (registration.startWorker !== false) startScheduler();
        },
        close: async () => undefined,
      });
    },
  };
  return Object.freeze(runtime);
}

/**
 * Opens a database the runtime owns.
 * @param options - Runtime options with a URL.
 * @returns The connection owner.
 */
function openOwned(options: PostgresJobsRuntimeOptions) {
  if (options.url === undefined) throw new TypeError("Postgres jobs need a url or a database");
  return openPostgresDatabase({ ...options, url: options.url });
}

/**
 * Declares what this backend supports natively.
 * @param service - Jobs service name.
 * @returns The capability report validated by the jobs runtime.
 */
function capabilities(service: string): JobsAdapterRuntime["capabilities"] {
  const native = (evidence: string) => ({ support: "native" as const, evidence: [evidence] });
  return Object.freeze({
    service,
    provider: "postgres",
    adapterId: "postgres-job",
    protocolVersion: 1 as const,
    features: Object.freeze({
      submission: true,
      read: true,
      list: true,
      observation: true,
      cancel: true,
      retry: true,
      schedules: true,
      "durable-sleep": false,
    }),
    capabilities: Object.freeze({
      submission: native("INSERT with a unique dedupe key"),
      read: native("SELECT by run ID"),
      list: native("keyset-paginated SELECT"),
      observation: { support: "adapter" as const, evidence: ["polling reads"] },
      cancel: native("row-locked first terminal transition"),
      retry: native("new run unique per retry identity"),
      schedules: native("occurrence claims unique on (service, schedule, occurrence)"),
      "durable-sleep": { support: "unsupported" as const, evidence: ["not implemented"] },
    }),
  });
}
