/** Exercises native production-start HTTP and observer pagination while borrowing the caller's already scoped application listener. */
import { expect } from "bun:test";
import { Effect, Schema } from "effect";
import { scaffoldRequest } from "../../../scripts/scaffold-http.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { ScaffoldProcessFailure } from "../../../scripts/scaffold-process.errors.js";
import { CommandLogPage } from "./commands-core-http.schemas.js";
import type { startProject } from "../../../packages/cli/src/commands/start.js";
import type { BuildResult } from "../../../packages/cli/src/commands/build.js";

/**
 * Asserts public health/graph/collections and the original function route.
 * @param started - Borrowed native listener whose owner closes it after assertions.
 * @param built - Accepted build identity used by the same production server.
 * @returns Lazy native HTTP assertions with bounded request cancellation.
 */
export const assertStartedHttp = Effect.fn("CommandFixture.http")(function* (
  started: Awaited<ReturnType<typeof startProject>>,
  built: BuildResult,
) {
  const base = `http://${started.hostname}:${started.port}`;
  const live = yield* scaffoldRequest(base + "/_relkit/v1/health/live");
  const graph = yield* scaffoldRequest(base + "/_relkit/v1/graph");
  expect(live.status).toBe(200);
  expect(graph.status).toBe(200);
  yield* scaffoldNative("command.health.body", () => live.text());
  expect(yield* scaffoldNative("command.graph.body", () => graph.json())).toMatchObject({
    generationId: "generation.runtime",
    graphHash: built.graphHash,
    activationFingerprint: built.activationFingerprint,
    graph: { nodes: expect.arrayContaining([expect.objectContaining({ id: "hello" })]) },
  });
  const routes = yield* scaffoldRequest(base + "/_relkit/v1/routes");
  const functions = yield* scaffoldRequest(base + "/_relkit/v1/functions");
  expect(routes.status).toBe(200);
  expect(functions.status).toBe(200);
  expect(yield* scaffoldNative("command.routes.body", () => routes.json())).toMatchObject({
    items: [expect.objectContaining({ id: "hello.route" })],
  });
  expect(yield* scaffoldNative("command.functions.body", () => functions.json())).toMatchObject({
    items: [expect.objectContaining({ id: "hello.say-hello" })],
  });
  const route = yield* scaffoldRequest(base + "/hello/RelKit");
  expect(route.status).toBe(200);
  expect(yield* scaffoldNative("command.route.body", () => route.json())).toEqual({
    message: "Hello, RelKit",
  });
  yield* assertInspectorAction(base, built);
  yield* assertInspectorLogs(base);
});

/**
 * Invokes the original logical function through the actual Inspector HTTP action.
 * @param base - Borrowed active listener URL.
 * @param built - Matching graph/cohort identity.
 * @returns Completion after verifying the native function output.
 */
const assertInspectorAction = Effect.fn("CommandFixture.action")(function* (
  base: string,
  built: BuildResult,
) {
  const action = yield* Effect.tryPromise({
    try: (signal) =>
      fetch(base + "/_relkit/v1/actions/functions/hello.say-hello/invoke", {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
        headers: { "content-type": "application/json", "idempotency-key": "hello-action" },
        body: JSON.stringify({
          generationId: "generation.runtime",
          graphHash: built.graphHash,
          input: { name: "Inspector" },
        }),
      }),
    catch: (cause) =>
      new ScaffoldProcessFailure({
        operation: "command.action",
        message: cause instanceof Error ? cause.message : "Native action failed",
      }),
  });
  expect(action.status).toBe(200);
  expect(yield* scaffoldNative("command.action.body", () => action.json())).toMatchObject({
    output: { message: "Hello, Inspector" },
  });
});

/**
 * Verifies real log correlation and continuation rather than inspecting source-only metadata.
 * @param base - Borrowed active listener URL.
 * @returns Completion after two distinct invocation records are read through the native cursor.
 */
const assertInspectorLogs = Effect.fn("CommandFixture.logs")(function* (base: string) {
  const url = base + "/_relkit/v1/logs?functionId=hello.say-hello&severity=info&limit=1";
  const response = yield* scaffoldRequest(url);
  const text = yield* scaffoldNative("command.logs.body", () => response.text());
  const page = Schema.decodeUnknownSync(Schema.fromJsonString(CommandLogPage))(text);
  expect(page.items).toEqual([
    expect.objectContaining({ component: "hello.say-hello", message: "hello invoked" }),
  ]);
  expect(page.nextCursor).toBeDefined();
  const next = yield* scaffoldRequest(url + "&cursor=" + page.nextCursor);
  const nextText = yield* scaffoldNative("command.logs.next", () => next.text());
  const continued = Schema.decodeUnknownSync(Schema.fromJsonString(CommandLogPage))(nextText);
  expect(continued.items).toEqual([
    expect.objectContaining({ component: "hello.say-hello", message: "hello invoked" }),
  ]);
  expect(continued.items[0]?.invocationId).not.toBe(page.items[0]?.invocationId);
});
