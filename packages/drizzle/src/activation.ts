import { createDatabaseContext } from "./context.js";
import { drizzleRuntimeOf } from "./service.js";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";

export interface DrizzleActivation<Service extends DrizzleServiceDescriptor<any, any, any, any>> {
  readonly client: Service extends DrizzleServiceDescriptor<any, infer Client, any, any>
    ? Client
    : never;
  readonly context: DatabaseContext<Service>;
  readonly close: () => Promise<void>;
}

const activations = new WeakMap<object, Promise<DrizzleActivation<any>>>();

/**
 * Activates a service once per descriptor object and returns its client, context, and close hook.
 * Repeated calls share the first activation; close does not evict the cached activation.
 *
 * @example
 * ```ts
 * import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle"
 * import { integer, sqliteTable } from "drizzle-orm/sqlite-core"
 *
 * if (typeof Bun !== "undefined") {
 *   const { Database } = await import("bun:sqlite")
 *   const { drizzle } = await import("drizzle-orm/bun-sqlite")
 *   const users = sqliteTable("users", { id: integer().primaryKey() })
 *   const service = defineDrizzleService({
 *     schema: { users },
 *     client: () => drizzle({ client: new Database(":memory:") }),
 *     dispose: (database) => database.$client.close(),
 *   })
 *   const active = await activateDrizzleService(service, {})
 *   try { console.assert(active.context.users !== undefined) }
 *   finally { await active.close() }
 * }
 * ```
 * @category Database
 * @since 0.1.0
 */
export function activateDrizzleService<
  Service extends DrizzleServiceDescriptor<any, any, any, any>,
>(service: Service, env: Readonly<Record<string, unknown>>): Promise<DrizzleActivation<Service>> {
  const existing = activations.get(service);
  if (existing !== undefined) return existing;
  const activation = activate(service, env);
  activations.set(service, activation);
  activation.catch(() => activations.delete(service));
  return activation;
}

async function activate<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
): Promise<DrizzleActivation<Service>> {
  const runtime = drizzleRuntimeOf(service);
  const client = await runtime.client({ env });
  const context = createDatabaseContext(service, runtime, client);
  let closed = false;
  const result = {
    client,
    context,
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await runtime.dispose?.(client);
    },
  };
  Object.defineProperty(result, Symbol.for("relkit.drizzle.service"), { value: service });
  return Object.freeze(result) as DrizzleActivation<Service>;
}
