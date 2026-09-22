import assert from "node:assert/strict";
import { PgClient } from "@effect/sql-pg";
import {
  DrizzleJobStore,
  mqDedupe,
  mqFlowChildren,
  mqFlowOutbox,
  mqJobAttempts,
  mqJobs,
  mqQueueControl,
  mqSchedules,
} from "effect-mq/drizzle-postgres";
import { Job, JobStore, Worker } from "effect-mq";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { docker, pgTypes, postgresImage, startPostgres } from "./effect-mq-postgres.ts";

const postgres = await startPostgres();
let started = true;

try {
  const jobs = mqJobs("effect_mq_jobs");
  const attempts = mqJobAttempts(jobs);
  class Retryable extends Job.make("phase0-retryable", {
    payload: { key: Schema.String },
    success: Schema.String,
    error: Schema.String,
    defaults: { attempts: 3, backoff: { type: "fixed", delay: "1 second" } },
  }) {}

  const tries = new Map<string, number>();
  const scheduleRuns: string[] = [];
  let cancelStarted = false;
  const handler = Retryable.toLayer((payload) =>
    Effect.gen(function* () {
      const current = yield* Worker.CurrentJob;
      if (payload.key === "cancel-active") {
        cancelStarted = true;
        yield* Effect.sleep("10 seconds");
        return "unexpected-completion";
      }
      if (payload.key === "scheduled") {
        scheduleRuns.push(String(current.jobId));
        return `scheduled-${current.jobId}`;
      }
      if (payload.key === "worker-restart") return "completed-after-worker-restart";
      const attempt = (tries.get(payload.key) ?? 0) + 1;
      tries.set(payload.key, attempt);
      return attempt < 3 ? yield* Effect.fail("transient") : `completed-on-${current.attempt}`;
    }),
  );
  const pg = PgClient.layer({ url: Redacted.make(postgres.url), types: pgTypes });
  const store = DrizzleJobStore.layer({
    jobs,
    attempts,
    schedules: mqSchedules(),
    queues: mqQueueControl(),
    dedupe: mqDedupe(),
    flowChildren: mqFlowChildren(),
    flowOutbox: mqFlowOutbox(),
  }).pipe(Layer.provide(pg));

  const nativeState = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* JobStore.JobStore;
      const acceptedId = yield* Retryable.enqueue(
        { key: "durable-acceptance" },
        { jobId: "phase0-accepted", keep: { count: 2 } },
      );
      const duplicateId = yield* Retryable.enqueue(
        { key: "durable-acceptance" },
        { jobId: "phase0-accepted", keep: { count: 2 } },
      );
      const queued = yield* service.getJob(acceptedId);
      yield* service.cancel(acceptedId);
      const cancelled = yield* service.getJob(acceptedId);
      return {
        acceptedId,
        duplicateId,
        queuedState: Option.isSome(queued) ? queued.value.state : "missing",
        cancelledState: Option.isSome(cancelled) ? cancelled.value.state : "missing",
      };
    }).pipe(Effect.provide(store)),
  );
  assert.equal(nativeState.acceptedId, nativeState.duplicateId);
  assert.equal(nativeState.queuedState, "waiting");
  assert.equal(nativeState.cancelledState, "cancelled");
  const live = handler.pipe(
    Layer.provideMerge(
      Worker.layer({
        pollInterval: "50 millis",
        lockDuration: "1 second",
        lockRenewInterval: "50 millis",
        stalledInterval: "2 seconds",
        scheduleSweepInterval: "50 millis",
      }),
    ),
    Layer.provideMerge(store),
  );
  const restartId = await Effect.runPromise(
    Retryable.enqueue({ key: "worker-restart" }, { delay: "500 millis", keep: { count: 2 } }).pipe(
      Effect.provide(store),
    ),
  );
  await Effect.runPromise(Effect.sleep("100 millis").pipe(Effect.provide(live)));
  const restartOutput = await Effect.runPromise(
    Retryable.awaitResult(restartId).pipe(Effect.provide(live)),
  );
  assert.equal(restartOutput, "completed-after-worker-restart");
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* JobStore.JobStore;
      const id = yield* Retryable.enqueue({ key: "postgres-retry" }, { keep: { count: 2 } });
      const output = yield* Retryable.awaitResult(id);
      const history = yield* Retryable.attempts(id);
      const cancelId = yield* Retryable.enqueue({ key: "cancel-active" }, { keep: { count: 2 } });
      yield* Effect.sleep("500 millis");
      yield* Retryable.cancel(cancelId);
      const cancelled = yield* Effect.gen(function* () {
        for (let attempt = 0; attempt < 20; attempt++) {
          const current = yield* service.getJob(cancelId);
          if (Option.isSome(current) && current.value.state === "cancelled") return current;
          yield* Effect.sleep("250 millis");
        }
        return yield* Effect.fail(new Error("effect-mq cancellation did not settle"));
      });
      yield* Retryable.schedule("phase0-schedule", {
        every: "100 millis",
        group: "phase0-schedules",
        payload: { key: "scheduled" },
      });
      yield* Retryable.schedule("phase0-schedule", {
        every: "100 millis",
        group: "phase0-schedules",
        payload: { key: "scheduled" },
      });
      const schedules = yield* service.listSchedules({ group: "phase0-schedules" });
      for (let attempt = 0; attempt < 200 && scheduleRuns.length === 0; attempt++) {
        yield* Effect.sleep("100 millis");
      }
      const scheduleRunCount = scheduleRuns.length;
      yield* Retryable.unschedule("phase0-schedule");
      return {
        id,
        output,
        history,
        cancelStarted,
        cancelledState: Option.isSome(cancelled) ? cancelled.value.state : "missing",
        scheduleCount: schedules.length,
        scheduleRunCount,
      };
    }).pipe(Effect.provide(live)),
  );
  assert.equal(result.output, "completed-on-3");
  assert.deepEqual(
    result.history.map((entry) => entry.outcome),
    ["retried", "retried", "completed"],
  );
  assert.equal(result.cancelStarted, true);
  assert.equal(result.cancelledState, "cancelled");
  assert.equal(result.scheduleCount, 1);
  assert.ok(result.scheduleRunCount > 0);
  const rowCount = Number(
    await docker(
      ["exec", postgres.container, "psql", "-Atqc", "select count(*) from effect_mq_jobs"],
      true,
    ),
  );
  console.log(
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        provider: "effect-mq",
        profile: "self-hosted-postgresql",
        status: "passed",
        package: { name: "effect-mq", version: "0.7.0" },
        postgres: { image: postgresImage, tablesCreated: 7, persistedJobRows: rowCount },
        durableAcceptance: {
          acceptedId: nativeState.acceptedId,
          duplicateReceipt: nativeState.duplicateId,
        },
        workerRestart: { acceptedBeforeRestart: true, output: restartOutput },
        retryable: {
          jobId: result.id,
          output: result.output,
          outcomes: result.history.map((entry) => entry.outcome),
          totalAttempts: result.history.length,
        },
        cancellation: { activeStarted: result.cancelStarted, terminalState: result.cancelledState },
        scheduling: {
          ownershipReconciled: result.scheduleCount === 1,
          fired: result.scheduleRunCount,
        },
        durableSleep: "unsupported by this retryable profile",
      },
      null,
      2,
    ),
  );
} finally {
  if (started) await docker(["rm", "-f", postgres.container], true);
  await docker(["volume", "rm", "-f", postgres.volume], true);
  started = false;
}
