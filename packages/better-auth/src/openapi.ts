/**
 * Generates native authentication documentation through a typed, observable
 * service. The activated SDK supplies endpoint metadata; projection does not
 * acquire a database or install the plugin's public schema/reference routes.
 * The exported Promise function is the server compatibility boundary.
 */
import {
  nativeCall,
  observeSpecializedOperation,
  squashDrizzleCause,
} from "@relkit/drizzle/internal";
import type { JsonValue } from "@relkit/contracts";
import type { Auth } from "better-auth";
import { Cause, Context, Effect, Exit, Layer } from "effect";
import { AuthFailure } from "./auth.errors.js";
import { projectAuthOpenApi } from "./openapi-projection.js";

/** Native metadata projection with no request identity or database ownership. */
export class AuthOpenApi extends Context.Service<
  AuthOpenApi,
  {
    /**
     * Generates native metadata at execution without installing public plugin routes.
     * @returns Mounted JSON metadata, or AuthFailure retaining its original SDK/projection cause.
     */
    readonly generate: () => Effect.Effect<JsonValue, AuthFailure>;
  }
>()("relkit/AuthOpenApi", {
  /**
   * Captures an already activated SDK without generating documentation eagerly.
   * @param auth - SDK context containing core/plugin endpoint metadata.
   * @returns Service implementation; generation has no remaining requirements.
   */
  make: (auth: Pick<Auth, "$context">) =>
    Effect.succeed({
      generate: Effect.fn("AuthOpenApi.generate")(() =>
        observeSpecializedOperation(
          "auth.openapi",
          nativeCall("auth.openapi", async () => {
            const { openAPI } = await import("better-auth/plugins");
            const context = await auth.$context;
            const response = await openAPI().endpoints.generateOpenAPISchema({
              context,
              asResponse: true,
            });
            return projectAuthOpenApi(await response.json(), context.options.basePath);
          }).pipe(
            Effect.mapError(
              (failure) => new AuthFailure({ operation: "auth.openapi", cause: failure.cause }),
            ),
          ),
        ),
      ),
    }),
}) {}

/**
 * Projects native core and plugin endpoints for RELKIT's shared API reference.
 * @param auth - Activated native auth instance; schema generation performs no database calls.
 * @param instrumentation - Owning application's logger, tracer and metric context.
 * @returns JSON-safe schema with mounted paths and isolated component names.
 * @remarks Does not install the plugin's public schema or reference endpoints.
 * @example const schema = await generateBetterAuthOpenApi(auth);
 */
export async function generateBetterAuthOpenApi(
  auth: Pick<Auth, "$context">,
  instrumentation: Context.Context<never> = Context.empty(),
): Promise<JsonValue> {
  const layer = Layer.effect(AuthOpenApi, AuthOpenApi.make(auth));
  const exit = await Effect.runPromiseExitWith(instrumentation)(
    AuthOpenApi.use((service) => service.generate()).pipe(Effect.provide(layer)),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw squashDrizzleCause(
    Cause.map(exit.cause, (failure) => (failure instanceof AuthFailure ? failure.cause : failure)),
  );
}
