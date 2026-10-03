import type { HttpLoggingOptions } from "./http-logging.types.js";
export type { HttpLoggingOptions } from "./http-logging.types.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer, Logger, References, Scope } from "effect";
import type { Hono } from "hono";
import { createLoggerLayer, currentNativeEffectContext } from "@relkit/runtime-effect";
import { admitObservabilityRecord } from "@relkit/observability";

const quiet = createLoggerLayer({ component: "http", human: false, json: false });
const quietContext = loggerContext(quiet);
const storage = new AsyncLocalStorage<Context.Context<never>>();
const installed = new WeakSet<Hono>();
// The app's sink owns retention. Implicit admission keeps the same redaction and
// brand without allocating an inaccessible second collector buffer.
const admission = Object.freeze({ collect: admitObservabilityRecord });

/** Supplies the owning app's logger to native compatibility runners.
 * @returns The app logger layer, or quiet defaults outside an app request.
 */
export function currentHttpLoggerLayer(): Layer.Layer<never> {
  return Layer.succeedContext(storage.getStore() ?? quietContext);
}

/** Resolves native caller configuration and the app logger without reacquiring a layer.
 * @returns The caller context with app logging supplied only when no logger was provisioned.
 */
export function currentHttpContext(): Context.Context<never> {
  const context = currentNativeEffectContext();
  const app = storage.getStore() ?? quietContext;
  if (context === undefined) return app;
  return context.mapUnsafe.has(Logger.CurrentLoggers.key) ? context : Context.merge(app, context);
}

/** Captures caller configuration for independently owned generation scopes.
 * @returns A layer retaining the current fiber's logger, clock and operation observers.
 */
export function currentHttpContextLayer(): Layer.Layer<never> {
  return Layer.succeedContext(currentHttpContext().pipe(Context.omit(Scope.Scope)));
}

/** Installs one app-owned logger bridge; no default console output enters protocol transports.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; the app receives one immutable logger configuration bridge.
 */
export function installHttpLogging(app: Hono, options: HttpLoggingOptions): void {
  if (installed.has(app)) return;
  installed.add(app);
  const layer = createLoggerLayer({
    component: "http",
    human: false,
    json:
      options.observability === undefined
        ? false
        : {
            write: (record) => {
              const result = options.observability?.collect(record);
              void Promise.resolve(result).catch(() => undefined);
            },
          },
    ...options.effectLogger,
    ...(options.observability === undefined
      ? {}
      : { collector: options.effectLogger?.collector ?? admission }),
  });
  const context = loggerContext(layer);
  app.use("*", (_context, next) => storage.run(context, next));
}

/** Captures only immutable logger references during synchronous app construction.
 * @param layer - Resource-free logger configuration layer.
 * @returns Logger and threshold references without retaining the acquisition scope.
 */
function loggerContext(layer: Layer.Layer<never>): Context.Context<never> {
  return Effect.runSync(Effect.context<never>().pipe(Effect.provide(layer))).pipe(
    Context.pick(Logger.CurrentLoggers, References.MinimumLogLevel),
  );
}
