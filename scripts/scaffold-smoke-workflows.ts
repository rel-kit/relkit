/** Exercises packed scaffold build and incremental public routes through captured native command authority. */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { scaffoldRequest } from "./scaffold-http.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";

const resultSchema = Schema.Struct({ ok: Schema.Boolean });
const documentSchema = Schema.Struct({ paths: Schema.Record(Schema.String, Schema.Json) });

/** Commands are captured once; native HTTP requests retain per-run cancellation. */
class ScaffoldWorkflows extends Context.Service<ScaffoldWorkflows>()(
  "relkit.scripts.ScaffoldWorkflows",
  {
    make: Effect.gen(function* () {
      const process = yield* ScaffoldProcess;
      return {
        build: (root: string) =>
          observeExecution("testing", "scaffold.build", buildScaffold(process.run, root)),
        routes: (root: string, port: number, cli: string) =>
          observeExecution(
            "testing",
            "scaffold.routes",
            exerciseRoutes(process.run, root, port, cli),
          ),
      };
    }),
  },
) {}
const workflowLayer = Layer.effect(ScaffoldWorkflows, ScaffoldWorkflows.make).pipe(
  Layer.provide(scaffoldProcessLayer),
);

/**
 * Verifies production bundling and the existing local-only provider refusal.
 * @param run - Captured finite command operation.
 * @param root - Standalone application.
 * @returns Completion after native build behavior is asserted.
 */
const buildScaffold = Effect.fn("ScaffoldWorkflows.build")(function* (
  run: Effect.Success<typeof ScaffoldProcess.make>["run"],
  root: string,
) {
  if (process.env.RELKIT_TEST_DOCKER !== "1") {
    yield* run({ args: ["run", "build"], cwd: root });
    return;
  }
  const exit = yield* Effect.exit(run({ args: ["run", "build"], cwd: root }));
  if (exit._tag !== "Failure")
    throw new Error("Local-only provider production build unexpectedly succeeded");
  const reason = exit.cause.reasons[0];
  if (
    exit.cause.reasons.length !== 1 ||
    reason?._tag !== "Fail" ||
    !(reason.error instanceof ScaffoldProcessFailure)
  )
    return yield* Effect.failCause(exit.cause);
  assert.match(reason.error.message, /RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED/);
});

/**
 * Exercises a route added during dev while requiring the last accepted backend to stay available.
 * @param run - Captured native command operation.
 * @param root - Standalone application.
 * @param port - Borrowed active backend listener.
 * @param cli - Actual packed CLI executable.
 * @returns Completion after native route and documentation assertions.
 */
const exerciseRoutes = Effect.fn("ScaffoldWorkflows.routes")(function* (
  run: Effect.Success<typeof ScaffoldProcess.make>["run"],
  root: string,
  port: number,
  cli: string,
) {
  const base = `http://127.0.0.1:${port}`;
  const billing = yield* requestBody(base, "/billing?value=smoke");
  assert.deepEqual(billing, { value: "smoke" });
  if (!existsSync(join(root, "src/routes/live/[id]/details/route.ts"))) {
    const output = yield* run({
      args: [cli, "--json", "add", "route", "/live/:id/details", "--mode", "route"],
      cwd: root,
    });
    assert.equal(Schema.decodeUnknownSync(Schema.fromJsonString(resultSchema))(output).ok, true);
  }
  yield* awaitAddedRoute(base);
  const response = yield* scaffoldRequest(base + "/_relkit/v1/openapi.json");
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(documentSchema))(
    yield* Effect.promise(() => response.text()),
  );
  assert.ok(document.paths["/billing"]);
  assert.ok(document.paths["/live/{id}/details"]);
  const scalar = yield* scaffoldRequest(base + "/_relkit/v1/api-reference");
  assert.equal(scalar.status, 200, "Adding routes keeps the default Scalar UI");
  assert.match(yield* Effect.promise(() => scalar.text()), /scalar/i);
  if (existsSync(join(root, "src/services/shipping/service.ts")))
    assert.deepEqual(yield* requestBody(base, "/shipping?value=second"), { value: "second" });
});

/**
 * Polls the new route without permitting downtime in the existing billing route.
 * @param base - Borrowed backend URL.
 * @returns Completion when the added route responds successfully.
 */
const awaitAddedRoute = Effect.fn("ScaffoldWorkflows.awaitRoute")(function* (base: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = yield* scaffoldRequest(base + "/live/42/details").pipe(
      Effect.catch(() => Effect.succeed(undefined)),
    );
    if (response?.status === 200) return;
    yield* requestBody(base, "/billing?value=smoke");
    yield* Effect.sleep("50 millis");
  }
  return yield* new ScaffoldProcessFailure({
    operation: "routes.ready",
    message: "Route added during dev never became available",
  });
});

/**
 * Requests and decodes one expected public JSON response.
 * @param base - Borrowed local listener.
 * @param path - Exact public route.
 * @returns Its schema-validated JSON tree after a successful status.
 */
function requestBody(base: string, path: string) {
  return Effect.gen(function* () {
    const response = yield* scaffoldRequest(base + path);
    const text = yield* Effect.promise(() => response.text());
    assert.equal(response.status, 200, path + ": " + text);
    return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(text);
  });
}

/**
 * Exposes installed build acceptance at the script boundary.
 * @param root - Standalone application.
 * @returns Completion after owned native command cleanup.
 */
export function verifyScaffoldBuild(root: string): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldWorkflows, (workflow) => workflow.build(root)).pipe(
      Effect.provide(workflowLayer),
    ),
  );
}

/**
 * Exposes native live acceptance while borrowing the caller's dev child.
 * @param root - Standalone application.
 * @param port - Active backend listener.
 * @param cli - Actual packed command executable.
 * @returns Completion after incremental assertions.
 */
export function exerciseScaffoldRoutes(root: string, port: number, cli: string): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldWorkflows, (workflow) => workflow.routes(root, port, cli)).pipe(
      Effect.provide(workflowLayer),
    ),
  );
}
