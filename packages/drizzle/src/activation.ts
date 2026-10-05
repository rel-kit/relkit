import { createDatabaseContext } from "./context.js";
import { drizzleRuntimeOf } from "./service.js";
import type { DrizzleServiceDescriptor } from "./types.js";
import type { DrizzleActivationOptions } from "./activation.types.js";
import type { DrizzleActivation } from "./activation.types.js";
import {
  Clock,
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Metric,
  References,
  Tracer,
} from "effect";
import { runDrizzlePromise, squashDrizzleCause } from "./failure.js";
import { DrizzleOwner, drizzleOwnerLayer, owners, withDrizzleWork } from "./owner.js";
import { runSpecializedTrace } from "./operation-tracing.js";
import { inheritNativeLeases } from "./native-leases.js";
import { specializedTracer } from "./trace-redaction.js";
export type { DrizzleActivationOptions, DrizzleActivation } from "./activation.types.js";

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
  if (options.isolated === true) return activate(service, env, options);
  const existing = activations.get(service);
  if (existing !== undefined) return existing;
  const activation = activate(service, env, options);
  activations.set(service, activation);
  activation.catch(() => activations.delete(service));
  return activation;
}

/**
 * Binds one native client and releases it if context construction fails.
 * @typeParam Service - Descriptor retaining client and model inference.
 * @param service - Lazy declaration to activate.
 * @param env - Resolved application environment.
 * @param options - Isolation and configured observation context.
 * @returns One native activation with shared close completion.
 */
async function activate<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
  options: DrizzleActivationOptions,
): Promise<DrizzleActivation<Service>> {
  const declaration = drizzleRuntimeOf(service);
  const instrumentation = Context.pick(
    References.CurrentLoggers,
    References.MinimumLogLevel,
    References.CurrentLogAnnotations,
    Metric.MetricRegistry,
    Metric.CurrentMetricAttributes,
    Tracer.Tracer,
    References.TracerEnabled,
    References.TracerTimingEnabled,
    Clock.Clock,
  )(options.instrumentation ?? Context.empty()).pipe(
    Context.add(
      Tracer.Tracer,
      specializedTracer(Context.get(options.instrumentation ?? Context.empty(), Tracer.Tracer)),
    ),
  );
  const runtime = ManagedRuntime.make(
    drizzleOwnerLayer(declaration, env).pipe(Layer.provide(Layer.succeedContext(instrumentation))),
  );
  const owner = await runDrizzlePromise(runtime, DrizzleOwner).catch(async (error: unknown) => {
    await runtime.dispose();
    throw error;
  });
  let result: DrizzleActivation<Service>;
  try {
    const context = createDatabaseContext(
      service,
      declaration,
      owner.client,
      (effect, operation) => {
        // Reentrant work retains the live parent lease rather than bypassing admission.
        const work = inheritNativeLeases(withDrizzleWork(result, effect));
        return runSpecializedTrace(`database.${operation}`, () =>
          runDrizzlePromise(runtime, work.pipe(Effect.provideContext(instrumentation))),
        );
      },
    );
    let closing: Promise<void> | undefined;
    result = Object.freeze(
      Object.defineProperty(
        {
          client: owner.client,
          context,
          close: (): Promise<void> => {
            if (closing !== undefined) return closing;
            runtime.runSync(owner.beginClose());
            closing = (async () => {
              await runDrizzlePromise(runtime, owner.awaitDrained());
              const exit = await Effect.runPromiseExit(
                runtime.disposeEffect.pipe(Effect.provideContext(instrumentation)),
              );
              if (Exit.isFailure(exit)) throw squashDrizzleCause(exit.cause);
            })();
            return closing;
          },
        },
        Symbol.for("relkit.drizzle.service"),
        { value: service },
      ),
    ) as DrizzleActivation<Service>;
    owners.set(result, {
      service: owner,
      dialect: declaration.dialect,
      runtime,
      instrumentation,
      run: (effect) =>
        runDrizzlePromise(runtime, effect.pipe(Effect.provideContext(instrumentation))),
    });
  } catch (error) {
    try {
      await runtime.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Drizzle acquisition and cleanup failed");
    }
    throw error;
  }
  return result;
}
