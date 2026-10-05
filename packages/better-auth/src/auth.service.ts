import {
  drizzleRuntimeOf,
  nativeCall,
  observeSpecializedOperation,
  redactSpecializedTrace,
  withDrizzleSqliteWork,
  withDrizzleWork,
} from "@relkit/drizzle/internal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Auth } from "better-auth";
import { Context, Effect, Layer, Schema } from "effect";
import { AuthFailure } from "./auth.errors.js";
import { AuthFactory, authFactoryLiveLayer } from "./auth.factory.js";
import { AuthBasePath } from "./auth.schemas.js";
import type { AuthConfiguration, AuthDatabase, AuthServiceInterface } from "./auth.types.js";

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
 * import { AuthService, authLiveLayer, type AuthConfiguration } from "@relkit/better-auth";
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
      withAuthWork(
        configuration.database,
        Effect.gen(function* () {
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
          const service = AuthService.of({
            handler: Effect.fn("AuthService.handler")((request) =>
              observeSpecializedOperation(
                "auth.handler",
                withAuthWork(
                  configuration.database,
                  nativePromise("auth.handler", () => native.handler(request)),
                ),
              ),
            ),
            api: Effect.fn("AuthService.api")((method, args) => {
              const operation = method === "getSession" ? "auth.session" : "auth.api";
              return observeSpecializedOperation(
                operation,
                withAuthWork(
                  configuration.database,
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
        }).pipe(Effect.uninterruptible),
      ),
    ),
  );
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

/**
 * Borrows the database owner and its physical SQLite execution permit together.
 * @typeParam A - SDK success value.
 * @typeParam E - SDK failure channel.
 * @typeParam R - Caller requirements retained by the borrowed work.
 * @param database - Active owner supplying physical client identity and lifetime.
 * @param effect - SDK work that waits for actual native completion.
 * @returns Lazy admitted work; permit waiting stays interruptible and hooks can reenter.
 */
function withAuthWork<A, E, R>(database: AuthDatabase, effect: Effect.Effect<A, E, R>) {
  return withDrizzleWork(database, withDrizzleSqliteWork(database, effect));
}

/**
 * Reads the native database declaration from the activation's established brand.
 * @param activation - Borrowed active database.
 * @returns Its declaration; invalid runtime values fail with the original TypeError.
 * @throws TypeError When an activation lacks its declaration brand.
 */
function databaseServiceOf(activation: AuthDatabase) {
  const service: unknown = Reflect.get(activation, Symbol.for("relkit.drizzle.service"));
  if (service === null || typeof service !== "object")
    throw new TypeError("Drizzle activation is missing its service");
  // The activation brand is the existing native contract, not a serialized SDK schema.
  return service as Parameters<typeof drizzleRuntimeOf>[0];
}
