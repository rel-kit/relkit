/** Compiled counterparts of the public authentication and browser TSDoc examples. */
import { createElement } from "react";
import { createAuthClient } from "better-auth/react";
import { Effect, Layer } from "effect";
import {
  activateBetterAuthService,
  defineBetterAuthService,
  AuthService,
  authLiveLayer,
  authServiceLayer,
  authFactoryLiveLayer,
  type AuthConfiguration,
} from "../../src/index.js";
import { BetterAuthRelkitClientProvider } from "../../src/react.js";

const declaration = defineBetterAuthService({
  baseURL: "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
const handler = declaration.handler;
/**
 * Composes the factory and service layers for an application-owned configuration.
 * @param configuration - Native options and borrowed database.
 * @returns The lazy authentication layer.
 */
function createAuthLayer(configuration: AuthConfiguration) {
  return authServiceLayer(configuration).pipe(Layer.provide(authFactoryLiveLayer));
}

/**
 * Checks the documented Effect execution boundary without running a production SDK.
 * @param configuration - Native options and borrowed database.
 * @returns The lazy program's future response once the owning application executes it.
 */
async function effectExample(configuration: AuthConfiguration) {
  const program = Effect.flatMap(AuthService, (auth) =>
    auth.handler(new Request("http://localhost/api/auth/session")),
  );
  return Effect.runPromise(program.pipe(Effect.provide(authLiveLayer(configuration))));
}

/**
 * Checks documented native activation without acquiring hidden DB resources.
 * @param database - Application-owned database activation.
 * @returns Native HTTP response using the supplied database owner.
 */
async function promiseExample(database: AuthConfiguration["database"]) {
  const service = defineBetterAuthService({ baseURL: "http://localhost" });
  const auth = await activateBetterAuthService(service, database, "/api/auth", { isolated: true });
  return auth.handler(new Request("http://localhost/api/auth/get-session"));
}

const authClient = createAuthClient();
const provider = createElement(BetterAuthRelkitClientProvider, { authClient, children: null });
void [handler, createAuthLayer, effectExample, promiseExample, provider];
