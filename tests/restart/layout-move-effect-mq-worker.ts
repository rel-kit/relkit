/** Runs the original native effect-mq job and schedule identity at either physical service path with no source-path-derived IDs. */
import { Job, JobStore, Worker } from "effect-mq";
import { Effect, Layer, Option, Schema } from "effect";
import { createEffectMqPostgresLayer } from "../../integrations/packages/effect-mq/src/postgres.js";

/** Stable native job descriptor; payload and result stay identical across the complete service move. */
class MovedJob extends Job.make("layout-move-native-job", {
  store: JobStore.JobStore,
  payload: { value: Schema.String },
  success: Schema.String,
  error: Schema.String,
}) {}

const [mode] = process.argv.slice(2);
const url = process.env.RELKIT_LAYOUT_TEST_POSTGRES;
if (!url || (mode !== "accept" && mode !== "recover"))
  throw new Error("Native layout worker requires an explicit test database and mode");
const store = createEffectMqPostgresLayer(url, "effect_mq_jobs");
const handler = MovedJob.toLayer((payload) => Effect.succeed(payload.value));
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

/**
 * Accepts work and a schedule before the worker executable moves, without starting a consumer.
 * @returns The provider's durable receipt and complete owned schedule count.
 */
const accept = Effect.fn("RestartLayout.nativeAccept")(function* () {
  const service = yield* JobStore.JobStore;
  const id = yield* MovedJob.enqueue(
    { value: "accepted-before-source-move" },
    { jobId: "layout-move-accepted", keep: { count: 2 }, metadata: { buildId: "flat-build" } },
  );
  yield* MovedJob.schedule("layout-move-schedule", {
    every: "1 hour",
    group: "layout-move",
    payload: { value: "scheduled" },
  });
  const schedules = yield* service.listSchedules({ group: "layout-move" });
  const job = yield* service.getJob(id);
  return {
    id: String(id),
    scheduleCount: schedules.length,
    state: Option.isSome(job) ? job.value.state : "missing",
  };
});

/**
 * Recovers the prior receipt and reconciles the same schedule through the physically moved native executable.
 * @returns Completion value, pinned acceptance metadata and native schedule count after reconciliation.
 */
const recover = Effect.fn("RestartLayout.nativeRecover")(function* () {
  const service = yield* JobStore.JobStore;
  const duplicate = yield* MovedJob.enqueue(
    { value: "wrong-replacement" },
    { jobId: "layout-move-accepted", keep: { count: 2 }, metadata: { buildId: "grouped-build" } },
  );
  yield* MovedJob.schedule("layout-move-schedule", {
    every: "1 hour",
    group: "layout-move",
    payload: { value: "scheduled" },
  });
  const schedules = yield* service.listSchedules({ group: "layout-move" });
  const value = yield* MovedJob.awaitResult(duplicate);
  const job = yield* service.getJob(duplicate);
  yield* MovedJob.unschedule("layout-move-schedule");
  return {
    id: String(duplicate),
    value,
    scheduleCount: schedules.length,
    buildId: Option.isSome(job) ? job.value.metadata.buildId : "missing",
  };
});

const result =
  mode === "accept"
    ? await Effect.runPromise(accept().pipe(Effect.provide(store), Effect.timeout("30 seconds")))
    : await Effect.runPromise(recover().pipe(Effect.provide(live), Effect.timeout("30 seconds")));
process.stdout.write(JSON.stringify(result) + "\n");
