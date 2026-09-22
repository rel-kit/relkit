import { PgClient, PgTypes } from "@effect/sql-pg";
import { Effect, Layer, Redacted, Result } from "effect";
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
export interface EffectMqPostgresSchema {
  readonly jobs: ReturnType<typeof mqJobs>;
  readonly attempts: ReturnType<typeof mqJobAttempts>;
  readonly schedules: ReturnType<typeof mqSchedules>;
  readonly queues: ReturnType<typeof mqQueueControl>;
  readonly dedupe: ReturnType<typeof mqDedupe>;
  readonly flowChildren: ReturnType<typeof mqFlowChildren>;
  readonly flowOutbox: ReturnType<typeof mqFlowOutbox>;
}
export function createEffectMqPostgresSchema(prefix = "effect_mq_jobs"): EffectMqPostgresSchema {
  if (!/^[a-z][a-z0-9_]{2,62}$/u.test(prefix))
    throw new TypeError("effect-mq table prefix is invalid");
  const jobs = mqJobs(prefix);
  return Object.freeze({
    jobs,
    attempts: mqJobAttempts(jobs),
    schedules: mqSchedules(),
    queues: mqQueueControl(),
    dedupe: mqDedupe(),
    flowChildren: mqFlowChildren(),
    flowOutbox: mqFlowOutbox(),
  });
}
/** Creates the native PostgreSQL store layer; migrations remain owned by this service. */
export function createEffectMqPostgresLayer(
  postgresUrl: string,
  prefix = "effect_mq_jobs",
): Layer.Layer<any, any, any> {
  if (typeof postgresUrl !== "string" || postgresUrl.trim() === "")
    throw new TypeError("effect-mq postgres URL is invalid");
  const schema = createEffectMqPostgresSchema(prefix);
  const types = PgTypes.makeRegistry();
  for (const [oid, arrayOid] of [
    [PgTypes.OID.timestamp, PgTypes.OID.timestampArray],
    [PgTypes.OID.timestamptz, PgTypes.OID.timestamptzArray],
  ] as const) {
    types.register(
      oid,
      {
        encode: (value: Date | number) =>
          PgTypes.encode(value instanceof Date ? value.getTime() : value, oid),
        decode: (bytes) =>
          Result.map(PgTypes.decode(bytes, oid, 1), (value) => new Date(Number(value))),
      },
      { arrayOid },
    );
  }
  const pg = PgClient.layer({ url: Redacted.make(postgresUrl), types });
  return DrizzleJobStore.layer(schema).pipe(Layer.provide(pg));
}
export const runEffectMq = Effect.runPromise;
