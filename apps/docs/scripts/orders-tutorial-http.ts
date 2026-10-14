/** Verifies native cookie authentication, per-user Orders access, validation and durable production restart. */
import { Effect, Schema } from "effect";
import { startTutorialServer } from "./orders-tutorial-process.js";
import { TutorialFailure } from "./orders-tutorial.errors.js";
import type { TutorialProject, TutorialServer } from "./orders-tutorial.types.js";

const password = "local-test-password-123";

/**
 * Sends one abortable native HTTP request.
 * @param server - Scoped production server.
 * @param path - Application URL path.
 * @param init - Native request options.
 * @returns The native response or a typed transport failure.
 */
const request = Effect.fn("Tutorial.http")(
  (server: TutorialServer, path: string, init?: RequestInit) =>
    Effect.tryPromise({
      try: (signal) => fetch(server.origin + path, { ...init, signal }),
      catch: () =>
        new TutorialFailure({ operation: "http.request", message: `Request failed: ${path}` }),
    }).pipe(Effect.timeout("5 seconds")),
);

/**
 * Validates one expected HTTP status before decoding the response.
 * @param response - Native response.
 * @param status - Expected status.
 * @returns Success or a typed assertion failure.
 */
const status = (response: Response, status: number) =>
  response.status === status
    ? Effect.void
    : Effect.fail(
        new TutorialFailure({
          operation: "http.status",
          message: `Expected ${status}, received ${response.status}`,
        }),
      );

/**
 * Registers or signs in one isolated test user and requires a real cookie.
 * @param server - Scoped production server.
 * @param name - Stable test user name.
 * @param signIn - Whether to reuse the durable user after restart.
 * @returns The native session cookie.
 */
const authenticate = Effect.fn("Tutorial.authentication")(function* (
  server: TutorialServer,
  name: string,
  signIn = false,
) {
  const response = yield* request(server, `/api/auth/${signIn ? "sign-in" : "sign-up"}/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: server.origin },
    body: JSON.stringify({ name, email: `${name.toLowerCase()}@orders.test`, password }),
  });
  yield* status(response, 200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie)
    return yield* new TutorialFailure({
      operation: "auth.cookie",
      message: "Authentication returned no session cookie",
    });
  return cookie;
});

/**
 * Exercises native middleware before business execution and denies another user's order.
 * @param server - Scoped production server.
 * @returns Completion after anonymous, authenticated, cross-user and invalid-input checks.
 */
const createAndProtect = Effect.fn("Tutorial.authorization")(function* (server: TutorialServer) {
  yield* status(yield* request(server, "/orders/production-1"), 401);
  const alice = yield* authenticate(server, "Alice");
  const bob = yield* authenticate(server, "Bob");
  const headers = { "content-type": "application/json", origin: server.origin, cookie: alice };
  const created = yield* request(server, "/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({ orderId: "production-1", sku: "book", quantity: 10 }),
  });
  yield* status(created, 201);
  const total = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ totalCents: Schema.Literal(900) })),
  )(yield* Effect.promise(() => created.text()));
  const other = yield* request(server, "/orders/production-1", { headers: { cookie: bob } });
  yield* status(other, 200);
  yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ found: Schema.Literal(false) })),
  )(yield* Effect.promise(() => other.text()));
  yield* status(
    yield* request(server, "/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ orderId: "invalid", sku: "book", quantity: 0 }),
    }),
    422,
  );
  return total;
});

/**
 * Closes the first server before starting the same application against its durable database.
 * @param project - Isolated production application.
 * @returns Completion after fresh cookie login can read the pre-restart order.
 */
export const verifyTutorialProduction = Effect.fn("Tutorial.production")(function* (
  project: TutorialProject,
) {
  const origin = yield* Effect.sync(() => {
    const reservation = Bun.serve({ port: 0, fetch: () => new Response() });
    const origin = `http://127.0.0.1:${reservation.port}`;
    reservation.stop(true);
    return origin;
  });
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* createAndProtect(yield* startTutorialServer(project, origin));
    }),
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* startTutorialServer(project, origin);
      const cookie = yield* authenticate(server, "Alice", true);
      const stored = yield* request(server, "/orders/production-1", { headers: { cookie } });
      yield* status(stored, 200);
      yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Struct({ found: Schema.Literal(true) })),
      )(yield* Effect.promise(() => stored.text()));
    }),
  );
  yield* Effect.logInfo("passed: authenticated production HTTP flow and restart");
});
