/** Exercises core start HTTP and rich-inspection exclusion on the caller's scoped listener. */
import { expect } from "bun:test";
import { Effect } from "effect";
import { scaffoldRequest } from "../../../scripts/scaffold-http.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import type { startProject } from "../../../packages/cli/src/commands/start.js";
import type { BuildResult } from "../../../packages/cli/src/commands/build.js";

/**
 * Asserts core health/graph, business routes and rich-inspection exclusion.
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
  for (const path of ["routes", "functions", "runtime", "logs", "stream"]) {
    const response = yield* scaffoldRequest(`${base}/_relkit/v1/${path}`);
    expect(response.status).toBe(404);
    yield* scaffoldNative("command.rich.body", () => response.text());
  }
  for (const name of ["RelKit", "Inspector"]) {
    const route = yield* scaffoldRequest(`${base}/hello/${name}`);
    expect(route.status).toBe(200);
    expect(yield* scaffoldNative("command.route.body", () => route.json())).toEqual({
      message: `Hello, ${name}`,
    });
  }
});
