import { betterAuth } from "better-auth";
import {
  nativeCall,
  observeSpecializedOperation,
  redactSpecializedTrace,
} from "@relkit/drizzle/internal";
import { Context, Effect, Layer } from "effect";
import { AuthFailure } from "./auth.errors.js";
import type { AuthFactoryInterface } from "./auth.types.js";

/**
 * Replaceable native SDK factory; auth service acquisition owns async initialization.
 * @remarks This low-level construction dependency returns native callables. Use
 * authServiceLayer to await its eager context initialization under DB admission.
 * @see {@link authFactoryLiveLayer} for composition with the owned auth service.
 */
export class AuthFactory extends Context.Service<AuthFactory, AuthFactoryInterface>()(
  "relkit/AuthFactory",
) {}

/**
 * Production SDK construction layer; acquiring the factory does not create auth.
 * @example
 * ```ts
 * import { Layer } from "effect";
 * import { authFactoryLiveLayer, authServiceLayer, type AuthConfiguration } from "@relkit/better-auth";
 * function createAuthLayer(configuration: AuthConfiguration) {
 *   return authServiceLayer(configuration).pipe(Layer.provide(authFactoryLiveLayer));
 * }
 * ```
 */
export const authFactoryLiveLayer = Layer.effect(
  AuthFactory,
  Effect.gen(function* () {
    return makeAuthFactory((options) =>
      nativeCall("auth.factory", () => betterAuth(options)).pipe(
        Effect.mapError(
          (failure) => new AuthFailure({ operation: "auth.factory", cause: failure.cause }),
        ),
      ),
    );
  }),
);

/**
 * Gives substituted factory implementations the same observable operation contract.
 * @param create - Lazy SDK creation dependency preserving typed failures and defects.
 * @returns Factory service whose bounded diagnostics never record native options.
 * @see {@link authFactoryLiveLayer} for factory provisioning at service acquisition.
 */
export function makeAuthFactory(create: AuthFactoryInterface["create"]): AuthFactoryInterface {
  const namedCreate: AuthFactoryInterface["create"] = Effect.fn("AuthFactory.create")((options) =>
    observeSpecializedOperation("auth.factory", create(options)),
  );
  return AuthFactory.of({
    create: (options) => redactSpecializedTrace(namedCreate(options)),
  });
}
