/** Reads the native generated graph and verifies a typed route's explicit path mapping without broad manifest or graph casts. */
import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { validateGraphShape, type ApplicationGraph } from "../../../packages/graph/src/index.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/**
 * Admits a generated JSON graph through the native validator before inspecting trigger configuration.
 * @param root - Borrowed grouped application root.
 * @returns Completion after asserting the original function ID and explicit request/path mapping.
 */
export function assertReviewedRouteGraph(root: string): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const text = yield* scaffoldNative("route.graph.read", () =>
        readFile(join(root, ".relkit/generated/application.graph.json"), "utf8"),
      );
      const graph = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(text);
      validateGraphShape(graph);
      // This is the graph SDK ABI after JSON and native graph validation.
      const native = graph as ApplicationGraph;
      const node = native.nodes.find(
        (entry) => entry.kind === "trigger" && entry.targetFunctionId === "users.example",
      );
      expect(node?.kind === "trigger" ? node.config.request : undefined).toMatchObject({
        kind: "input",
        fields: { value: { kind: "path", name: "id" } },
      });
    }),
  );
}
