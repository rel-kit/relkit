/** Compiles the native commerce application and compares one validated graph/hash across registration, deployment and generated transport consumers. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Effect } from "effect";
import { generateClient } from "../../packages/client-generator/src/index.ts";
import {
  hashGraph,
  validateGraphShapeEffect,
  type ApplicationGraph,
} from "../../packages/graph/src/index.ts";
import { generateOpenApiJson } from "../../packages/openapi/src/index.ts";
import { compileProject } from "../compiler/fixture-runner.ts";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { commerceConsumerOutputs } from "./http/commerce-consistency-outputs.js";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");

test(
  "commerce-example keeps one graph and hash across acceptance consumers",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const compiled = yield* scaffoldNative("commerce.consistency.compile", () =>
          compileProject("commerce-example", APP_ROOT),
        );
        // Native validation guards this SDK projection before any consumer interprets it.
        const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
        yield* validateGraphShapeEffect(graph);
        const graphHash = hashGraph(graph);
        const { registration, deployment, pulumi } = commerceConsumerOutputs(graph);
        expect(compiled.diagnostics).toEqual([]);
        expect(compiled.exitCode).toBe(0);
        expect(compiled.graphHash).toBe(graphHash);
        expect(registration.graphHash).toBe(graphHash);
        expect(deployment.graphHash).toBe(graphHash);
        expect(JSON.parse(pulumi.planJson).graphHash).toBe(graphHash);
        expect(pulumi.indexTs).toContain("export const graphHash = plan.graphHash;");
        expect(compiled.manifest).toContain(`manifestGraphHash = ${JSON.stringify(graphHash)}`);
        expect(compiled.normalization.outputs.openapi).toBe(generateOpenApiJson(graph));
        expect(compiled.normalization.outputs.client).toBe(generateClient(graph));
      }),
    ),
  30_000,
);
