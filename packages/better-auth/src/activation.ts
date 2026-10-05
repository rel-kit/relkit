import {
  drizzleInstrumentationOf,
  inheritNativeLeases,
  runSpecializedTrace,
  squashDrizzleCause,
} from "@relkit/drizzle/internal";
import type { Auth } from "better-auth";
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import type { BetterAuthActivationOptions } from "./activation.types.js";
import { AuthFailure } from "./auth.errors.js";
import { AuthService, authLiveLayer, authNativeOf } from "./auth.service.js";
import type {
  AuthDatabase,
  BetterAuthRuntime,
  BetterAuthServiceDescriptor,
  BetterAuthServiceOptions,
} from "./auth.types.js";
import { BETTER_AUTH_RUNTIME } from "./symbols.js";

/**
 * Binds native auth to an acquired database and its declared ALL route.
 * @typeParam Options - Native configuration retained by the lazy declaration.
 * @param service - Shared acquisition captures the first database and route prefix.
 * @param database - Borrowed database; auth never owns or disposes it.
 * @param basePath - Route-derived prefix validated during acquisition.
 * @param options - Isolation leaves the descriptor handler target untouched.
 * @returns Native auth preserving options, session inference and endpoint properties.
 * @remarks Layer acquisition is independent of waiting callers. Failures evict the
 * shared attempt; successful auth remains retained after database close.
 * @example
 * ```ts
 * import { activateBetterAuthService, defineBetterAuthService, type AuthConfiguration } from "@relkit/better-auth";
 * async function handleNativeAuth(database: AuthConfiguration["database"]): Promise<Response> {
 *   const service = defineBetterAuthService({ baseURL: "http://localhost" });
 *   const auth = await activateBetterAuthService(service, database, "/api/auth", { isolated: true });
 *   return auth.handler(new Request("http://localhost/api/auth/get-session"));
 * }
 * // The application retains database ownership until admitted work completes.
 * ```
 */
export async function activateBetterAuthService<Options extends BetterAuthServiceOptions>(
  service: BetterAuthServiceDescriptor<Options>,
  database: AuthDatabase,
  basePath: string,
  options: BetterAuthActivationOptions = {},
): Promise<Auth<any>> {
  const state = runtimeOf(service);
  let owner = options.isolated === true ? undefined : state.activation;
  if (owner === undefined) {
    if (!Reflect.has(database, Symbol.for("relkit.drizzle.service")))
      throw new TypeError("Drizzle activation is missing its service");
    const instrumentation = drizzleInstrumentationOf(database);
    // Captured diagnostics apply both during Layer acquisition and subsequent native calls.
    owner = ManagedRuntime.make(
      // ManagedRuntime builds in a separate fiber. Inherit the native parent's
      // leases for acquisition only; the returned context must not retain them.
      Layer.effectContext(
        inheritNativeLeases(
          Layer.build(authLiveLayer({ options: state.options, database, basePath })),
        ),
      ).pipe(Layer.provideMerge(Layer.succeedContext(instrumentation))),
    );
    if (options.isolated !== true) state.activation = owner;
  }
  const currentOwner = owner;
  try {
    return await runAuthPromise(
      currentOwner,
      Effect.flatMap(AuthService, (auth) =>
        Effect.sync(() => authNativeAdapter(currentOwner, authNativeOf(auth))),
      ),
      undefined,
      "auth.acquire",
    );
  } catch (error) {
    if (state.activation === currentOwner) state.activation = undefined;
    await currentOwner.dispose();
    throw error;
  }
}

/**
 * Runs the Promise boundary, unwrapping expected auth failures.
 * @typeParam A - Successful operation result.
 * @typeParam E - Effect failure channel.
 * @typeParam R - Runtime's provided services.
 * @typeParam ER - Runtime acquisition failures.
 * @param runtime - Managed auth owner.
 * @param effect - Lazy operation preserving defects and interruption.
 * @param options - Request cancellation forwarded to the runner.
 * @param operation - Bounded invocation label; the trace captures no SDK result.
 * @returns Promise preserving native exception identity and mixed causes.
 * @internal
 */
export function runAuthPromise<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions,
  operation = "auth.api",
): Promise<A> {
  const admittedEffect = inheritNativeLeases(effect);
  return runSpecializedTrace(operation, async () => {
    const exit = await runtime.runPromiseExit(admittedEffect, options);
    if (Exit.isSuccess(exit)) return exit.value;
    // Unwrap auth causes before the shared renderer retains every cleanup/interrupt reason.
    throw squashDrizzleCause(
      Cause.map(exit.cause, (failure) =>
        failure instanceof AuthFailure ? failure.cause : failure,
      ),
    );
  });
}

/**
 * Routes native callables through admission while preserving native properties.
 * @param owner - Managed owner reused by each Promise boundary.
 * @param native - SDK instance with initialization complete.
 * @returns Stable proxy retaining native object and function metadata.
 * @remarks Handler, fetch and API calls are admitted. The native $context is
 * retained as an advanced SDK view; direct adapter access requires its DB owner's
 * lifetime rather than establishing a new admission lease.
 * @internal
 */
export function authNativeAdapter(
  owner: BetterAuthRuntime<BetterAuthServiceOptions>["activation"] & {},
  native: Auth<any>,
): Auth<any> {
  const cached = nativeAdapters.get(owner);
  if (cached !== undefined) return cached;
  const methods = new Map<PropertyKey, unknown>();
  const handler = (request: Request) =>
    runAuthPromise(
      owner,
      Effect.flatMap(AuthService, (auth) => auth.handler(request)),
      { signal: request.signal },
      "auth.handler",
    );
  const api = new Proxy(native.api, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function" || typeof key !== "string") return value;
      if (!methods.has(key))
        methods.set(
          key,
          new Proxy(value, {
            apply(_method, _receiver, args) {
              return runAuthPromise(
                owner,
                Effect.flatMap(AuthService, (auth) => auth.api(key, args)),
                undefined,
                key === "getSession" ? "auth.session" : "auth.api",
              );
            },
          }),
        );
      return methods.get(key);
    },
  });
  const adapter = new Proxy(native, {
    get(target, key, receiver) {
      if (key === "handler" || key === "fetch") return handler;
      return key === "api" ? api : Reflect.get(target, key, receiver);
    },
  });
  nativeAdapters.set(owner, adapter);
  return adapter;
}

// Owners retain native auth already; this weak projection cache adds no lifetime.
const nativeAdapters = new WeakMap<object, Auth<any>>();

/**
 * Reads the server-only state brand established by defineBetterAuthService.
 * @typeParam Options - Native options held by the declaration.
 * @param service - Auth declaration.
 * @returns Lazy managed-owner state.
 * @throws TypeError When the value is not a supported declaration.
 */
function runtimeOf<Options extends BetterAuthServiceOptions>(
  service: BetterAuthServiceDescriptor<Options>,
): BetterAuthRuntime<Options> {
  const runtime: unknown = Reflect.get(service, BETTER_AUTH_RUNTIME);
  if (
    runtime === null ||
    typeof runtime !== "object" ||
    !("options" in runtime) ||
    !("activation" in runtime)
  )
    throw new TypeError("Invalid Better Auth service descriptor");
  return runtime as BetterAuthRuntime<Options>;
}
