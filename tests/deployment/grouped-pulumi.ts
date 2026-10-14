/** Owns isolated native Pulumi mock processes and compares actual resource identities for paired flat/grouped compiler plans. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import type { NormalizedGraph } from "../../packages/compiler/src/normalize-graph-types.js";
import { groupedDeploymentPlans } from "./grouped-layout-contract.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "../../scripts/scaffold-process.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";

import { NativeMockResources as resourceList } from "./grouped-pulumi.schemas.js";

/**
 * Compares real AWS materialization through native mocked engines without credentials or remote resource acquisition.
 * @param before - Actual flat compiler graph.
 * @param after - Actual grouped compiler graph.
 * @returns Joined native resource comparison retaining every actual type/name and logical ownership decision.
 */
export const assertGroupedPulumi = Effect.fn("GroupedPulumi.compare")(
  function* (before: NormalizedGraph, after: NormalizedGraph) {
    const root = yield* Effect.acquireRelease(
      scaffoldNative("grouped.pulumi.root", () =>
        mkdtemp(join(tmpdir(), "relkit-grouped-pulumi-")),
      ),
      (root) =>
        scaffoldNative("grouped.pulumi.release", () =>
          rm(root, { recursive: true, force: true }),
        ).pipe(Effect.orDie),
    );
    const commands = yield* ScaffoldProcess;
    const projections = [];
    for (const [index, plan] of groupedDeploymentPlans(before, after).entries()) {
      const path = join(root, index + ".json");
      yield* scaffoldNative("grouped.pulumi.plan", () => writeFile(path, JSON.stringify(plan)));
      const output = yield* commands
        .run({
          cwd: resolve(import.meta.dir, "../.."),
          args: [resolve(import.meta.dir, "grouped-pulumi.probe.ts"), path],
        })
        .pipe(Effect.timeout("30 seconds"));
      projections.push(
        yield* Schema.decodeUnknownEffect(Schema.fromJsonString(resourceList))(
          output.trim().split("\n").at(-1),
        ),
      );
    }
    assert.deepEqual(projections[1], projections[0]);
    assert.ok(projections[0]?.some((resource) => resource.type === "aws:ecs/service:Service"));
  },
  (effect) => effect.pipe(Effect.provide(scaffoldProcessLayer), Effect.scoped),
);
