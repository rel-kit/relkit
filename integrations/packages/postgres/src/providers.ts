/**
 * Authoring entry for the Postgres backend. `postgresJob()` and `postgresEvent()`
 * build the provider adapters an application selects in `defineApp({ jobs, events })`.
 * They validate options and serialize connection and behavior data only; the
 * runtime entry opens connections when the application starts.
 */
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  type ProviderAdapter,
} from "relkit/provider";
import { serializeJobsServiceOptions, validateJobsServiceOptions } from "relkit/jobs";
import { postgresTables } from "./schema.js";
import type {
  PostgresConnectionOptions,
  PostgresEventOptions,
  PostgresJobOptions,
  PostgresUrlInput,
} from "./providers.types.js";
export type * from "./providers.types.js";

const job = defineProviderCapability("job");
const event = defineProviderCapability("event");
const durable = defineProviderFeature(job, "durable");
const retryable = defineProviderFeature(job, "retryable");
const scheduling = defineProviderFeature(job, "native-scheduling");
const integration = defineIntegrationReference("postgres");
const connectionContract = defineConnectionContract({
  url: { required: false, sensitive: true, authoredValue: "fallback" },
  schema: { required: false, authoredValue: "fallback", default: "public" },
  tablePrefix: { required: false, authoredValue: "fallback", default: "relkit" },
});
const JOB_KEYS = new Set([
  ...["url", "schema", "tablePrefix", "leaseMs", "pollIntervalMs", "limits", "workers"],
  ...["observation", "maxElapsed", "hookTimeout", "shutdownGrace"],
]);
const EVENT_KEYS = new Set(["url", "schema", "tablePrefix", "leaseMs", "pollIntervalMs"]);

/** Jobs provider adapter selected with `postgresJob()`. @experimental */
export type PostgresJobAdapter = ProviderAdapter<typeof job, "postgres-job">;
/** Events provider adapter selected with `postgresEvent()`. @experimental */
export type PostgresEventAdapter = ProviderAdapter<typeof event, "postgres-event">;
/** Integration reference shared by both adapters. @experimental */
export const postgresIntegration = integration;
/** Connection fields both adapters accept. @experimental */
export const postgresConnectionContract = connectionContract;

/**
 * Selects durable Postgres jobs and schedules for a jobs profile.
 * @param options - Connection, lease and polling settings plus common jobs service options.
 * @returns The jobs provider adapter.
 * @throws TypeError for unknown options or an invalid URL, identifier or duration.
 * @example const jobs = postgresJob({ url: env.secret("DATABASE_URL") });
 * @experimental
 */
export function postgresJob(options: PostgresJobOptions = {}): PostgresJobAdapter {
  assertOptions(options, JOB_KEYS, "postgresJob");
  validateJobsServiceOptions(options);
  const { url: _url, schema: _schema, tablePrefix: _prefix, ...service } = options;
  const { leaseMs: _lease, pollIntervalMs: _poll, ...common } = service;
  return defineProviderAdapter({
    integration,
    capability: job,
    adapterId: "postgres-job",
    connectionContract,
    connection: connection(options),
    behavior: defineProviderBehavior(serializeJobsServiceOptions(common, native(options))),
    features: [durable, retryable, scheduling],
  }) as PostgresJobAdapter;
}

/**
 * Selects durable Postgres events with per-consumer delivery for an events profile.
 * @param options - Connection, lease and polling settings.
 * @returns The events provider adapter.
 * @throws TypeError for unknown options or an invalid URL, identifier or duration.
 * @example const events = postgresEvent({ url: env.secret("DATABASE_URL") });
 * @experimental
 */
export function postgresEvent(options: PostgresEventOptions = {}): PostgresEventAdapter {
  assertOptions(options, EVENT_KEYS, "postgresEvent");
  return defineProviderAdapter({
    integration,
    capability: event,
    adapterId: "postgres-event",
    connectionContract,
    connection: connection(options),
    behavior: defineProviderBehavior({ native: native(options) }),
  }) as PostgresEventAdapter;
}

/**
 * Rejects unknown keys and invalid connection, identifier and timing values.
 * @param options - Authored options.
 * @param keys - Keys this constructor accepts.
 * @param name - Constructor name used in messages.
 */
function assertOptions(
  options: PostgresConnectionOptions,
  keys: ReadonlySet<string>,
  name: string,
): void {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError(`${name} options must be an object`);
  for (const key of Object.keys(options))
    if (!keys.has(key)) throw new TypeError(`Unknown ${name} option ${key}`);
  postgresTables(options);
  if (options.url !== undefined) url(options.url);
  for (const [key, value] of [
    ["leaseMs", options.leaseMs],
    ["pollIntervalMs", options.pollIntervalMs],
  ] as const)
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 10))
      throw new TypeError(`${name} ${key} must be an integer of at least 10`);
}

/**
 * Builds the serialized connection record, keeping binding references intact.
 * @param options - Validated options.
 * @returns Connection values for the provider adapter.
 */
function connection(options: PostgresConnectionOptions) {
  return {
    ...(options.url === undefined ? {} : { url: url(options.url) }),
    ...(options.schema === undefined ? {} : { schema: options.schema }),
    ...(options.tablePrefix === undefined ? {} : { tablePrefix: options.tablePrefix }),
  };
}

/**
 * Keeps provider-specific timing in the behavior's `native` record.
 * @param options - Validated options.
 * @returns The lease and polling settings that were authored.
 */
function native(options: PostgresConnectionOptions) {
  return {
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
    ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
  };
}

/**
 * Accepts a binding reference or a `postgres:`/`postgresql:` URL.
 * @param input - Authored URL or binding.
 * @returns The binding, or the normalized URL text.
 */
function url(input: PostgresUrlInput): PostgresUrlInput {
  if (isBindingValueRef(input)) return input;
  const parsed = new URL(input);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new TypeError("Postgres url must use the postgres protocol");
  return parsed.toString();
}
