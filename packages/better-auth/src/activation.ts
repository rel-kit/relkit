/** Binds lazy auth declarations to shared or isolated managed native owners.
 * Failed shared acquisition is evicted; successful owners borrow the database lifecycle and preserve native settlement.
 */
import { drizzleInstrumentationOf, inheritNativeLeases } from "@relkit/drizzle/internal";
import type { Auth } from "better-auth";
import { Effect, Layer, ManagedRuntime } from "effect";
import type { BetterAuthActivationOptions } from "./activation.types.js";
import { AuthService, authLiveLayer, authNativeOf } from "./auth.service.js";
import type {
  AuthDatabase,
  BetterAuthRuntime,
  BetterAuthServiceDescriptor,
  BetterAuthServiceOptions,
} from "./auth.types.js";
import { BETTER_AUTH_RUNTIME } from "./symbols.js";
import { runAuthPromise } from "./auth-run.js";
import { authNativeAdapter } from "./auth-native-adapter.js";
export { runAuthPromise } from "./auth-run.js";
export { authNativeAdapter } from "./auth-native-adapter.js";

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
 * import { activateBetterAuthService, defineBetterAuthService, type AuthConfiguration } from "@relkit/better-auth/drizzle";
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
    if (options.isolated !== true) bindSharedHandler(state, owner);
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
    if (state.activation === currentOwner) {
      state.activation = undefined;
      state.handle = undefined;
    }
    await currentOwner.dispose();
    throw error;
  }
}

/** Binds the root's database-independent handler to this shared owner. */
function bindSharedHandler(
  state: BetterAuthRuntime<BetterAuthServiceOptions>,
  owner: NonNullable<BetterAuthRuntime<BetterAuthServiceOptions>["activation"]>,
): void {
  state.activation = owner;
  state.handle = (request) =>
    runAuthPromise(
      owner,
      Effect.flatMap(AuthService, (auth) => auth.handler(request)),
      { signal: request.signal },
      "auth.handler",
    );
}

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
