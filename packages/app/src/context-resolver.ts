import { isEnvRef } from "@relkit/config";
import { Effect, Result, Schema } from "effect";
import { observeApp } from "./app-observability.js";
import { AppConstantRunner, AppConstantRunnerPromiseLive } from "./context-resolution-service.js";
import type { ConstantResolver, PromptValue } from "./context-descriptors.types.js";
import type {
  ApplicationContextOptions,
  ApplicationContextResolver,
  ApplicationResolveOptions,
  ResolvedApplicationContext,
} from "./context-resolver.types.js";
export type * from "./context-resolver.types.js";
/** Expected context registration or resolution failure with its original cause.
 * @example if (error._tag === "ContextResolutionFailure") console.error(error.message);
 */
export class ContextResolutionFailure extends Schema.TaggedError<ContextResolutionFailure>()(
  "ContextResolutionFailure",
  { message: Schema.String, cause: Schema.Defect() },
) {}
/** Builds an application context resolver in Effect.
 * @param options - Constants, prompts, and resolved environment values.
 * @returns A resolver or ContextResolutionFailure for duplicate names.
 * @example Effect.runSync(createApplicationContextResolverEffect({ env: {} }));
 */
export const createApplicationContextResolverEffect = Effect.fn("App.createContextResolver")(
  (options: ApplicationContextOptions) =>
    observeApp(
      "context.create",
      Effect.gen(function* () {
        const staticValues: Record<string, unknown> = {};
        const resolvers: [string, ConstantResolver][] = [];
        for (const descriptor of Object.values(options.constants ?? {})) {
          for (const [key, value] of Object.entries(descriptor.values)) {
            if (Object.hasOwn(staticValues, key) || resolvers.some(([name]) => name === key))
              return yield* Effect.fail(
                failure(new TypeError(`Constant "${key}" is registered more than once`)),
              );
            if (typeof value === "function") resolvers.push([key, value]);
            else staticValues[key] = isEnvRef(value) ? options.env[value.name] : value;
          }
        }
        const prompts: Readonly<Record<string, PromptValue>> = Object.freeze(
          Object.fromEntries(
            Object.entries(options.prompts ?? {}).map(([key, descriptor]) => [
              key,
              descriptor.value,
            ]),
          ),
        );
        const resolveEffect = Effect.fn("App.resolveContext")(
          (context: ApplicationResolveOptions) =>
            observeApp(
              "context.resolve",
              Effect.suspend(() =>
                context.signal.aborted
                  ? Effect.interrupt
                  : Effect.raceFirst(
                      waitForAbort(context.signal),
                      Effect.gen(function* () {
                        const runner = yield* AppConstantRunner;
                        const dynamic = yield* Effect.forEach(
                          resolvers,
                          ([key, resolver]) =>
                            Effect.map(
                              runner.run(resolver, {
                                env: options.env,
                                log: context.log,
                                signal: context.signal,
                              }),
                              (value) => [key, value] as const,
                            ),
                          { concurrency: 8 },
                        );
                        return {
                          constants: Object.freeze({
                            ...staticValues,
                            ...Object.fromEntries(dynamic),
                          }),
                          prompts,
                        } satisfies ResolvedApplicationContext;
                      }),
                    ),
              ),
            ),
        );
        const resolver: ApplicationContextResolver = Object.freeze({
          resolveEffect,
          async resolve(context: ApplicationResolveOptions): Promise<ResolvedApplicationContext> {
            if (context.signal.aborted)
              throw context.signal.reason ?? new DOMException("Aborted", "AbortError");
            const result = await Effect.runPromise(
              Effect.result(
                resolveEffect(context).pipe(Effect.provide(AppConstantRunnerPromiseLive)),
              ),
              { signal: context.signal },
            );
            if (Result.isFailure(result)) throw result.failure.cause;
            return result.success;
          },
        });
        return resolver;
      }),
    ),
);
/** Builds a context resolver synchronously for existing application callers.
 * @param options - Constants, prompts, and resolved environment values.
 * @returns A resolver with Promise and Effect execution paths.
 * @throws TypeError when constant names collide.
 * @example createApplicationContextResolver({ env: {} });
 */
export function createApplicationContextResolver(
  options: ApplicationContextOptions,
): ApplicationContextResolver {
  const result = Effect.runSync(Effect.result(createApplicationContextResolverEffect(options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Keeps the original error available to the Promise adapter. */
function failure(cause: Error): ContextResolutionFailure {
  return new ContextResolutionFailure({
    message: cause.message,
    cause,
  });
}
/** Waits for caller cancellation and removes its listener on every race exit. */
function waitForAbort(signal: AbortSignal): Effect.Effect<never> {
  return Effect.callback<never>((resume) => {
    if (signal.aborted) {
      resume(Effect.interrupt);
      return;
    }
    let notified = false;
    const onAbort = () => {
      notified = true;
      resume(Effect.interrupt);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (notified || signal.aborted) {
      signal.removeEventListener("abort", onAbort);
      if (!notified) resume(Effect.interrupt);
      return;
    }
    return Effect.sync(() => signal.removeEventListener("abort", onAbort));
  });
}
