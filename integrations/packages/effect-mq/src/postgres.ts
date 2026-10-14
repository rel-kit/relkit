/** Builds lazy native PostgreSQL job-store Layers with scoped driver ownership and explicit timestamp compatibility. */
import { PgClient, PgTypes } from "@effect/sql-pg";
import { JobStore } from "effect-mq";
import { Effect, Layer, Redacted, Result } from "effect";
import { EffectMqPgCompatibility } from "./postgres-listen.js";
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
import type { EffectMqPostgresSchema } from "./postgres.types.js";
export type { EffectMqPostgresSchema } from "./postgres.types.js";

/**
 * Builds the existing native store's complete schema without opening a database connection.
 * @param prefix - Validated PostgreSQL job-table name; related table names retain the SDK contract.
 * @returns Native Drizzle tables borrowed by the scoped store Layer.
 */
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
/**
 * Builds the native PostgreSQL store Layer; the calling application owns schema migration and Layer lifetime.
 * @param postgresUrl - Explicit provider connection string, redacted before driver construction.
 * @param prefix - Validated native job-table name.
 * @returns A lazy store Layer retaining native SQL/store failures and requiring no remaining services.
 */
export function createEffectMqPostgresLayer(
  postgresUrl: string,
  prefix = "effect_mq_jobs",
): Layer.Layer<
  JobStore.JobStore,
  JobStore.JobStoreError | Layer.Error<ReturnType<typeof PgClient.layer>>
> {
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
        /**
         * Preserves native timestamp encoding for Date and epoch-millisecond inputs.
         * @param value - SDK timestamp input.
         * @returns Native PostgreSQL timestamp encoding.
         */
        encode: (value: Date | number) =>
          PgTypes.encode(value instanceof Date ? value.getTime() : value, oid),
        /**
         * Restores the Date values required by the native job-store row contract.
         * @param bytes - SDK timestamp bytes.
         * @returns The native parse result with the decoded Date.
         */
        decode: (bytes) =>
          Result.map(PgTypes.decode(bytes, oid, 1), (value) => new Date(Number(value))),
      },
      { arrayOid },
    );
  }
  const pg = PgClient.layer({ url: Redacted.make(postgresUrl), types });
  return DrizzleJobStore.layer(schema).pipe(
    Layer.provide(EffectMqPgCompatibility.pipe(Layer.provide(pg))),
  );
}
/** Existing native Promise edge; callers supply and own the complete store/worker Layer lifetime. */
export const runEffectMq = Effect.runPromise;
