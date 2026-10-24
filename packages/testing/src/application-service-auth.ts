/** Composes auth over a borrowed database without taking a second disposal authority. */
import { generateBetterAuthOpenApi } from "@relkit/better-auth/drizzle";
import { createHttpAuthRuntime } from "@relkit/runtime-hono";
import { Effect } from "effect";
import type { TestRawRoute, TestRoute } from "./application-routes.js";
import type {
  ApplicationServicesPlatform,
  AuthDeclaration,
  NativeDatabase,
} from "./application-native-services.types.js";
import type { TestApplicationServices } from "./application-services.types.js";
import { nativeServiceError } from "./application-errors.js";

/**
 * Acquires the optional native auth handler and its protection runtime.
 * @param platform - Native activation dependencies.
 * @param declaration - Optional authored auth declaration.
 * @param database - The already acquired, owner-scoped database.
 * @param routes - Routes with the one native ALL mount.
 * @returns Borrowed auth authority without a database finalizer.
 */
export const acquireApplicationAuth = Effect.fn("Testing.services.auth")(function* (
  platform: ApplicationServicesPlatform,
  declaration: AuthDeclaration | undefined,
  database: NativeDatabase | undefined,
  routes: readonly TestRoute[],
) {
  if (declaration === undefined) return {};
  const mounts = routes.filter(isAuthMount);
  const mount = mounts[0];
  if (database === undefined || mount === undefined || mounts.length !== 1) {
    return yield* Effect.fail(
      new Error("Better Auth tests require one Drizzle service and one auth ALL route"),
    );
  }
  const instrumentation = yield* Effect.context<never>();
  const active = yield* Effect.tryPromise({
    try: () => platform.auth(declaration, database, basePath(mount)),
    catch: nativeServiceError,
  });
  const result: Pick<TestApplicationServices, "auth" | "authHandler"> = {
    auth: createHttpAuthRuntime({
      protected: mount.auth?.protected ?? [],
      publicPaths: [basePath(mount), mount.path],
      getOpenApiDocument: () => generateBetterAuthOpenApi(active, instrumentation),
      getSession: async (headers) => (await active.api.getSession({ headers })) ?? null,
    }),
    authHandler: (request) => active.handler(request),
  };
  return result;
});

/**
 * Converts foreign rejections once while retaining native Error identity.
 * @typeParam Failure - Foreign rejection inferred at the Promise boundary.
 * @param cause - Rejection returned by native activation.
 * @returns The original Error or an Error carrying the foreign cause.
 */
export { nativeServiceError } from "./application-errors.js";

/**
 * Recognizes the explicit native authentication mount.
 * @param route - Authored route.
 * @returns Whether the route has a raw ALL handler and auth registration.
 */
function isAuthMount(route: TestRoute): route is TestRawRoute {
  return route.method === "ALL" && "handler" in route && route.auth !== undefined;
}

/**
 * Derives the native base path from its catch-all route.
 * @param route - Authored native mount.
 * @returns Base path without the terminal wildcard.
 */
function basePath(route: TestRawRoute): string {
  return route.path.replace(/\/\*[^/]+\??$/, "");
}
