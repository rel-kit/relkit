/**
 * Runtime registrations the generated server uses to build the Postgres jobs
 * and events providers from `defineApp` profiles. Providers of one process that
 * point at the same database and namespace share one pool. The process role
 * comes from `RELKIT_WORKER_ROLE`: `worker` (the default) serves requests and
 * runs job workers, the scheduler and event consumers; `api` only serves
 * requests, submits jobs and publishes events, leaving the work to separate
 * worker-role instances.
 */
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "relkit/provider";
import { openPostgresDatabase } from "./database.js";
import type { PostgresDatabase, PostgresDatabaseOptions } from "./database.types.js";
import { createPostgresEventProvider } from "./events-provider.js";
import { createPostgresJobsRuntime } from "./jobs-runtime.js";

/** Whether this process only serves requests (`api`) or also runs background work (`worker`). @experimental */
export type PostgresWorkerRole = "api" | "worker";

const pools = new Map<string, { database: PostgresDatabase; users: number }>();

/**
 * Reads the process role.
 * @param value - `RELKIT_WORKER_ROLE`; defaults to the current environment.
 * @returns `api` or `worker`.
 * @throws TypeError for any other value.
 * @example workerRole("api") === "api";
 * @experimental
 */
export function workerRole(value = process.env.RELKIT_WORKER_ROLE): PostgresWorkerRole {
  if (value === undefined || value === "" || value === "worker") return "worker";
  if (value === "api") return "api";
  throw new TypeError(`RELKIT_WORKER_ROLE must be "api" or "worker", not "${value}"`);
}

/** Registrations for the `postgres-job` and `postgres-event` adapters. @experimental */
export const runtimeIntegration: RuntimeProviderIntegration<"postgres"> = Object.freeze({
  kind: "runtime-integration",
  integrationId: "postgres",
  registrations: Object.freeze([
    {
      capability: "job",
      adapterId: "postgres-job",
      protocolVersion: 1,
      create: (context: RuntimeProviderContext) => {
        const shared = acquire(databaseOptions(context));
        const runtime = createPostgresJobsRuntime({
          database: shared.database,
          service: context.profile,
          ...timing(context),
        });
        return { value: runtime, release: () => runtime.close().then(shared.release) };
      },
    },
    {
      capability: "event",
      adapterId: "postgres-event",
      protocolVersion: 1,
      create: (context: RuntimeProviderContext) => {
        const shared = acquire(databaseOptions(context));
        const provider = createPostgresEventProvider({
          database: shared.database,
          profile: context.profile,
          consumers: workerRole() === "worker",
          ...timing(context),
        });
        return { value: provider, release: () => provider.close().then(shared.release) };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"postgres">;

/**
 * Resolves the connection: `RELKIT_POSTGRES_URL` wins over the authored URL.
 * @param context - Provider construction context.
 * @returns Connection options.
 * @throws Error when no URL is available.
 */
function databaseOptions(context: RuntimeProviderContext): PostgresDatabaseOptions {
  const url = text(process.env.RELKIT_POSTGRES_URL) ?? text(context.connection.url);
  if (url === undefined)
    throw new Error(`Postgres ${context.capability} profile ${context.profile} needs a url`);
  const schema = text(context.connection.schema);
  const tablePrefix = text(context.connection.tablePrefix);
  return {
    url,
    ...(schema === undefined ? {} : { schema }),
    ...(tablePrefix === undefined ? {} : { tablePrefix }),
  };
}

/**
 * Reads the authored lease and polling settings from the behavior's `native` record.
 * @param context - Provider construction context.
 * @returns Only the settings that were authored.
 */
function timing(context: RuntimeProviderContext) {
  const behavior = context.behavior as { readonly native?: Readonly<Record<string, number>> };
  const native = behavior?.native ?? {};
  return {
    ...(typeof native.leaseMs === "number" ? { leaseMs: native.leaseMs } : {}),
    ...(typeof native.pollIntervalMs === "number" ? { pollIntervalMs: native.pollIntervalMs } : {}),
  };
}

/**
 * Shares one pool per database and namespace within the process.
 * @param options - Connection options.
 * @returns The pool and a release that closes it after its last user.
 */
function acquire(options: PostgresDatabaseOptions) {
  const key = [options.url, options.schema ?? "public", options.tablePrefix ?? "relkit"].join("\0");
  const entry = pools.get(key) ?? { database: openPostgresDatabase(options), users: 0 };
  entry.users += 1;
  pools.set(key, entry);
  let released = false;
  return {
    database: entry.database,
    release: async () => {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users > 0) return;
      pools.delete(key);
      await entry.database.close();
    },
  };
}

/**
 * Narrows a connection value to non-empty text.
 * @param value - Connection or environment value.
 * @returns The text, or undefined.
 */
function text(value: string | number | boolean | object | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
