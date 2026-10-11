/**
 * Compiles the canonical commerce application through its isolated Bun fixture
 * boundary and asserts full graph/manifest metadata. Effect owns the finite
 * native compilation adapter; Bun remains the test runtime required by fixtures.
 */
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { hashGraph } from "../../packages/graph/src/index.ts";
import { compileProject } from "./fixture-runner.ts";
import {
  assertCommerceApplication,
  assertCommerceProviders,
  assertCommerceEdges,
} from "./commerce-example-graph.ts";
import { assertCommerceArtifacts } from "./commerce-example-artifacts.ts";

/** Expected failure from the isolated native compiler fixture. */
class CommerceCompilationError extends Data.TaggedError("CommerceCompilationError")<{
  /** Original native failure retained behind a safe adapter message. */
  readonly cause: Error;
}> {}

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");

describe("commerce-example compiler acceptance", () => {
  test("compiles the canonical mixed integration topology", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const run = yield* Effect.tryPromise({
          try: () => compileProject("commerce-example", APP_ROOT),
          catch: (cause) =>
            new CommerceCompilationError({
              cause: new Error("Commerce compilation failed", { cause }),
            }),
        });
        const graph = run.normalization.graph;
        if (graph === undefined)
          return yield* new CommerceCompilationError({
            cause: new Error("Compiler did not produce a graph"),
          });
        expect(run.diagnostics).toEqual([]);
        expect(run.exitCode).toBe(0);
        expect(hashGraph(graph)).toBe(run.graphHash);
        expect(run.manifest.match(/manifestGraphHash = "([^"]+)"/)?.[1]).toBe(run.graphHash);

        const authored = run.normalization.descriptors.filter(
          ({ identity }) => identity !== undefined,
        );
        expect(new Set(authored.map(({ kind, id }) => `${kind}:${id}`)).size).toBe(authored.length);
        expect(authored.map(({ id }) => id)).toEqual(
          expect.arrayContaining([
            "commerce-api",
            "assets.objects",
            "receipts.objects",
            "orders.prices",
            "orders.rate-limits",
            "orders.order-support",
            "route.post.orders",
          ]),
        );

        assertCommerceApplication(graph);
        assertCommerceProviders(graph);
        assertCommerceEdges(graph);
        assertCommerceArtifacts(run);
      }),
    ));
});
