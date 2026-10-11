/**
 * Verifies prepared source carries the complete frozen canonical registration plan.
 * A single emitted declaration is executed with the real freeze helper; production
 * retains its runtime planner, and a mismatched accepted hash cannot be emitted.
 */
import { expect, it } from "@effect/vitest";
import { deepFreeze, GRAPH_VERSION } from "@relkit/contracts";
import { createRegistrationPlan, hashGraph } from "@relkit/graph";
import { Effect, Schema } from "effect";
import { serverSource } from "../../src/commands/build-server.js";

const graph = { contractVersion: GRAPH_VERSION, appId: "prepared-plan", nodes: [], edges: [] };
const graphHash = hashGraph(graph);
const activation = {
  graphHash,
  manifestHash: "sha256:manifest",
  runtimeIntegrationsPlanHash: "sha256:integrations",
};
const configuration = {
  maxBodyBytes: 1_048_576,
  apiDocs: { enabledInProduction: false },
  clientContract: true,
  mcp: true,
  maxPreviewBytes: 1_048_576,
  httpApplication: "prepared" as const,
};

it.effect("executes the exact canonical frozen projection without a runtime planner import", () =>
  Effect.sync(() => {
    const source = serverSource(graph, graphHash, activation, {}, {}, configuration);
    const declaration = source.split("\n").find((line) => line.startsWith("const plan = "));
    if (declaration === undefined) throw new Error("Generated plan declaration absent");
    // Only the known pure declaration emitted from this trusted test graph is executed.
    const projected = new Function("deepFreeze", `${declaration}\nreturn plan;`)(deepFreeze);
    if (!Schema.is(Schema.Json)(projected)) throw new Error("Plan is not JSON-safe");
    expect(projected).toEqual(createRegistrationPlan(graph));
    expect(Object.isFrozen(projected)).toBe(true);
    if (projected === null || typeof projected !== "object" || Array.isArray(projected))
      throw new Error("Plan must be a record");
    expect(Object.isFrozen(projected.httpTriggers)).toBe(true);
    expect(source).not.toContain('import { createRegistrationPlan } from "@relkit/graph"');
    expect(source).toContain("Runtime graph hash verification failed.");
    expect(source).not.toContain('from "@relkit/inspector-api";');
    expect(source).toContain('await import("@relkit/inspector-api")');
    expect(source).toContain("module.installInspectorEndpoints(app,");
    expect(source).toContain(
      "const generationId = `generation-${tokenFrom(process.env.RELKIT_GENERATION_TOKEN)}`;",
    );
    expect(source).not.toContain("process.env.RELKIT_GENERATION_ID");
    expect(source).toContain("RELKIT_DEFERRED_INTEGRITY_HASH");
    expect(source).toContain("Deferred runtime integrity verification failed.");
    expect(source).toContain("await verifyDeferredFunction(functionId)");
  }),
);

it.effect("preserves production planning and rejects a mixed prepared graph hash", () =>
  Effect.sync(() => {
    expect(serverSource(graph, graphHash, activation)).toContain(
      "const plan = createRegistrationPlan(graph);",
    );
    expect(serverSource(graph, graphHash, activation)).toContain(
      'const generationId = process.env.RELKIT_GENERATION_ID ?? "generation.runtime";',
    );
    expect(() =>
      serverSource(graph, "sha256:mismatched", activation, {}, {}, configuration),
    ).toThrow("Prepared registration plan does not match the accepted graph.");
  }),
);
