import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import type { Auth } from "better-auth";
import { Effect, Layer } from "effect";
import { AuthFactory, makeAuthFactory } from "../../src/auth.factory.js";
import { authServiceLayer } from "../../src/auth.service.js";
import type { AuthConfiguration } from "../../src/auth.types.js";
import type { AuthFactoryOutcome, NativeAuthStubOptions } from "./auth-test.types.js";

/**
 * Substitutes deterministic SDK construction at the production service boundary.
 * @param configuration - Explicit database/path/options retained by the service.
 * @param outcome - Lazy factory success, failure or defect controlled by the test.
 * @returns Same AuthService contract without constructing hidden production auth.
 */
export function authTestLayer(configuration: AuthConfiguration, outcome: AuthFactoryOutcome) {
  return authServiceLayer(configuration).pipe(
    Layer.provide(
      Layer.succeed(
        AuthFactory,
        makeAuthFactory(() => outcome),
      ),
    ),
  );
}

/**
 * Builds only the native SDK properties exercised by the auth boundary tests.
 * @param options - Test-controlled SDK work and initialization Promise.
 * @returns Opaque SDK stand-in; no real provider or auth adapter is acquired.
 * @remarks The assertion represents the external SDK's opaque context/plugin types.
 * Tests validate callable forwarding and metadata rather than pretend to decode them.
 */
export function nativeAuthStub(options: NativeAuthStubOptions = {}): Auth<any> {
  const handler = options.handler ?? (async () => new Response("ok"));
  const session = Object.assign(options.session ?? (async () => null), {
    path: "/get-session",
    options: { method: "GET" },
  });
  return {
    handler,
    fetch: handler,
    api: { getSession: session, extraEndpoint: session },
    options: { basePath: "/api/auth" },
    $ERROR_CODES: {},
    $context: options.context ?? Promise.resolve({}),
  } as unknown as Auth<any>;
}

const user = sqliteTable("user", { id: integer().primaryKey() });

/**
 * Acquires a fake native DB under the same Drizzle lifecycle as production auth.
 * @param dispose - Test-controlled native release.
 * @returns Scoped activation whose borrowed auth operations use real admission.
 */
export function authTestDatabase(dispose: () => void = () => undefined) {
  const declaration = defineDrizzleService({ schema: { user }, client: () => ({}), dispose });
  return Effect.acquireRelease(
    Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
    (database) => Effect.promise(() => database.close()),
  );
}
