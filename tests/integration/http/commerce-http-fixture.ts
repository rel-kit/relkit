/** Acquires the real grouped compiler projection and releases its route client on every outcome. */
import { resolve } from "node:path";
import { Effect, Schema } from "effect";
import {
  createRegistrationPlan,
  validateGraphShape,
  type ApplicationGraph,
} from "../../../packages/graph/src/index.ts";
import { createApp, type HttpInvocationOptions } from "../../../packages/runtime-hono/src/index.ts";
import { createTestHttpClient } from "../../../packages/testing/src/index.ts";
import { compileProject } from "../../compiler/fixture-runner.ts";
import { commerceHttpEngine } from "./commerce-http-engine.ts";
import { commerceHttpManifest } from "./commerce-http-manifest.ts";
import type { CommerceHttpFixture } from "./commerce-http.types.ts";
import { scalarReference } from "../../../packages/runtime-hono/src/scalar.ts";

/** Owns only the native test client; compilation evaluates descriptors without acquiring providers. */
export const commerceHttpFixture = Effect.gen(function* () {
  const compiled = yield* Effect.tryPromise(() =>
    compileProject("commerce-example", resolve(import.meta.dir, "../../../examples/commerce")),
  );
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(
    compiled.graphBytes,
  );
  if (!isApplicationGraph(decoded)) throw new Error("Commerce did not produce a graph");
  const graph = decoded;
  const plan = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const document = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(compiled.normalization.outputs.openapi);
  const invocations: HttpInvocationOptions[] = [],
    uploadedKeys: string[] = [];
  const values = new Map<string, number>();
  const app = createApp({
    plan,
    manifest: commerceHttpManifest(plan),
    apiDocs: { document, ui: "scalar", reference: scalarReference },
    engine: commerceHttpEngine(invocations, uploadedKeys),
    rateLimitRuntime: {
      resolveStore: () => ({
        get: (key) => values.get(key),
        increment: (key, delta) => {
          const value = (values.get(key) ?? 0) + delta;
          values.set(key, value);
          return value;
        },
        delete: (key) => {
          values.delete(key);
        },
      }),
    },
  });
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => createTestHttpClient(app)),
    (owner) => Effect.promise(() => owner.close()),
  );
  return { compiled, graph, client, invocations, uploadedKeys } satisfies CommerceHttpFixture;
});

/**
 * Uses the authoritative graph validator before granting a serialized graph's typed projection.
 * @typeParam Value - Foreign parsed JSON.
 * @param value - Actual compiler graph bytes after decoding.
 * @returns Whether the complete graph contract validated.
 */
function isApplicationGraph<Value>(value: Value): value is Value & ApplicationGraph {
  validateGraphShape(value);
  return true;
}
