import { createDatabaseContext } from "./context.js";
import { drizzleRuntimeOf } from "./service.js";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";
import type { DrizzleActivationOptions } from "./activation.types.js";
export type { DrizzleActivationOptions } from "./activation.types.js";

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
 * Isolated acquisition bypasses that cache and transfers close ownership to the caller.
 * @typeParam Service - Descriptor retaining client and model inference.
 * @param service - Lazy database declaration.
 * @param env - Environment passed to its client factory.
 * @param options - Isolation policy for independently scoped application owners.
 * @returns The acquired client/context and its idempotent close hook.
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
>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
  options: DrizzleActivationOptions = {},
): Promise<DrizzleActivation<Service>> {
  if (options.isolated === true) return activate(service, env);
  const existing = activations.get(service);
  if (existing !== undefined) return existing;
  const activation = activate(service, env);
  activations.set(service, activation);
  activation.catch(() => activations.delete(service));
  return activation;
}

/**
 * Binds one native client and releases it if context construction fails.
 * @typeParam Service - Descriptor retaining client and model inference.
 * @param service - Lazy declaration to activate.
 * @param env - Resolved application environment.
 * @returns One native activation with shared close completion.
 */
async function activate<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
): Promise<DrizzleActivation<Service>> {
  const runtime = drizzleRuntimeOf(service);
  const client = await runtime.client({ env });
  let context: DatabaseContext<Service>;
  try {
    context = createDatabaseContext(service, runtime, client);
  } catch (error) {
    try {
      await runtime.dispose?.(client);
    } catch {
      /* Preserve the acquisition failure. */
    }
    throw error;
  }
  let closing: Promise<void> | undefined;
  const result = {
    client,
    context,
    close: (): Promise<void> =>
      (closing ??= Promise.resolve().then(async () => {
        await runtime.dispose?.(client);
      })),
  };
  Object.defineProperty(result, Symbol.for("relkit.drizzle.service"), { value: service });
  return Object.freeze(result) as DrizzleActivation<Service>;
}
