/** Owns admitted native authentication acquisition, handler calls and API dispatch.
 * Database leases cover uncancellable SDK settlement; the database owner retains release authority.
 */
import {
  drizzleRuntimeOf,
  nativeCall,
  observeSpecializedOperation,
  redactSpecializedTrace,
} from "@relkit/drizzle/internal";
import type { Auth } from "better-auth";
import { Context, Effect, Layer, Schema } from "effect";
import { AuthFailure } from "./auth.errors.js";
import { AuthFactory, authFactoryLiveLayer } from "./auth.factory.js";
import { AuthBasePath } from "./auth.schemas.js";
import type { AuthConfiguration, AuthDatabase, AuthServiceInterface } from "./auth.types.js";
import { checkNativeAuthDependencies } from "./dependencies.js";
import { databaseServiceOf, withAuthWork } from "./auth-database.js";

/**
 * Native auth service; each method admits DB work and retains SDK completion.
 * @see {@link authServiceLayer} for ownership and a checked composition example.
 */
export class AuthService extends Context.Service<AuthService, AuthServiceInterface>()(
  "relkit/AuthService",
) {}

/**
 * Acquires authentication against a borrowed Drizzle owner using a supplied factory.
 * @param configuration - Auth options, database owner and filesystem route prefix.
 * @returns A lazy layer providing AuthService; failures retain native causes.
 * @remarks SDK initialization and calls finish before database admission ends.
 * This layer never disposes the database. Provide AuthFactory to substitute SDK creation.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { AuthService, authLiveLayer, type AuthConfiguration } from "@relkit/better-auth/drizzle";
 * async function handleAuth(configuration: AuthConfiguration): Promise<Response> {
 *   const program = Effect.flatMap(AuthService, (auth) => auth.handler(new Request("http://localhost/api/auth/session")));
 *   return Effect.runPromise(program.pipe(Effect.provide(authLiveLayer(configuration))));
 * }
 * ```
 */
export function authServiceLayer(configuration: AuthConfiguration) {
  return Layer.effect(
    AuthService,
    observeSpecializedOperation(
      "auth.acquire",
      withAuthWork(configuration.database, acquireAuth(configuration).pipe(Effect.uninterruptible)),
    ),
  );
}

/** Awaits native plugin initialization before releasing the borrowed database admission. */
function acquireAuth(configuration: AuthConfiguration) {
  return Effect.gen(function* () {
    yield* Schema.decodeUnknownEffect(AuthBasePath)(configuration.basePath).pipe(
      Effect.mapError(
        () =>
          new AuthFailure({
            operation: "auth.acquire",
            cause: new TypeError(`Invalid Better Auth base path "${configuration.basePath}"`),
          }),
      ),
    );
    const declaration = databaseServiceOf(configuration.database);
    const database = drizzleRuntimeOf(declaration);
    const factory = yield* AuthFactory;
    yield* checkNativeAuthDependencies();
    const { drizzleAdapter } = yield* nativePromise(
      "auth.acquire",
      () => import("better-auth/adapters/drizzle"),
    );
    const { drizzle: adapterOptions, ...options } = configuration.options;
    const native = yield* factory.create({
      ...options,
      basePath: configuration.basePath,
      database: drizzleAdapter(configuration.database.client, {
        ...(adapterOptions ?? {}),
        schema: adapterOptions?.schema ?? database.schema,
        provider: database.dialect,
      }),
    });
    // Better Auth starts async plugin initialization eagerly; retain the borrow until it settles.
    yield* nativePromise("auth.acquire", () => native.$context);
    return createService(native, configuration.database);
  });
}

/** Applies the same admission and redaction boundary to both native call surfaces. */
function createService(native: Auth<any>, database: AuthDatabase): AuthServiceInterface {
  const service = AuthService.of({
    handler: Effect.fn("AuthService.handler")((request) =>
      observeSpecializedOperation(
        "auth.handler",
        withAuthWork(
          database,
          nativePromise("auth.handler", () => native.handler(request)),
        ),
      ),
    ),
    api: Effect.fn("AuthService.api")((method, args) => {
      const operation = method === "getSession" ? "auth.session" : "auth.api";
      return observeSpecializedOperation(
        operation,
        withAuthWork(
          database,
          nativePromise(operation, () =>
            Reflect.apply(Reflect.get(native.api, method), native.api, args),
          ),
        ),
      );
    }),
  });
  // The adapter must enclose Effect.fn's outer named span as well as its body.
  const protectedService = AuthService.of({
    handler: (request) => redactSpecializedTrace(service.handler(request)),
    api: (method, args) => redactSpecializedTrace(service.api(method, args)),
  });
  nativeInstances.set(protectedService, native);
  return protectedService;
}

// Raw SDK callables remain private; the public service only exposes admitted effects.
const nativeInstances = new WeakMap<AuthServiceInterface, Auth<any>>();

/**
 * Projects a raw SDK instance only at the server's guarded compatibility boundary.
 * @param service - Layer-acquired authentication service.
 * @returns Private native instance for constructing the admitted public SDK proxy.
 * @throws TypeError When a service implementation has no native compatibility view.
 * @internal
 */
export function authNativeOf(service: AuthServiceInterface): Auth<any> {
  const native = nativeInstances.get(service);
  if (native === undefined)
    throw new TypeError("Auth service has no native compatibility instance");
  return native;
}

/**
 * Builds the production authentication service with the native Better Auth factory.
 * @param configuration - Explicit options and an acquired borrowed database.
 * @returns A lazy, substitutable service layer; see authServiceLayer for composition.
 * @see {@link authServiceLayer} for the checked execution and ownership example.
 */
export function authLiveLayer(configuration: AuthConfiguration) {
  return authServiceLayer(configuration).pipe(Layer.provide(authFactoryLiveLayer));
}

/**
 * Bridges an uncancellable SDK Promise while preserving admission until settlement.
 * @typeParam A - Native SDK success value.
 * @param operation - Bounded authentication operation name.
 * @param execute - Lazy SDK call, including synchronous exceptions.
 * @returns A lazy effect with typed SDK failure; interruption resumes after completion.
 */
function nativePromise<A>(operation: string, execute: () => A | PromiseLike<A>) {
  return nativeCall(operation, execute).pipe(
    Effect.mapError((failure) => new AuthFailure({ operation, cause: failure.cause })),
  );
}
