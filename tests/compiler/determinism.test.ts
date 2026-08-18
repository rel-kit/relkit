import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "../../packages/contracts/src/index.ts";
import { canonicalGraphJson, hashGraph } from "../../packages/graph/src/index.ts";
import { compileFixture, type FixtureCompilation } from "./fixture-runner.ts";
import {
  invalidateWatchDependencies,
  WATCH_ARTIFACTS,
  writeGeneratedArtifacts,
} from "../../packages/compiler/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineRoute, http } from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

const WATCH_ROOT = "/tmp/zsys-determinism-watch";
const input = z.object({ id: z.string() });

describe.serial("compiler determinism", () => {
  test("keeps compiler and Phase 6 artifact bytes stable across roots, orders, identities, and insertion order", async () => {
    const sorted = await compileFixture("valid-full", {
      order: "sorted",
      generationId: "pid-101-clock-20240101T000000Z",
    });
    const reversed = await compileFixture("valid-full", {
      order: "reverse",
      generationId: "pid-202-clock-20350101T000000Z",
    });
    const randomized = await compileFixture("valid-full", {
      order: "random",
      generationId: "pid-303-clock-20450101T000000Z",
    });

    expect(sorted.temporaryRoot).not.toBe(reversed.temporaryRoot);
    expect(sorted.temporaryRoot).not.toBe(randomized.temporaryRoot);
    expect(sorted.extracted[0]?.reference.generationId).not.toBe(
      reversed.extracted[0]?.reference.generationId,
    );
    expect(artifactSnapshot(reversed)).toEqual(artifactSnapshot(sorted));
    expect(artifactSnapshot(randomized)).toEqual(artifactSnapshot(sorted));

    const randomizedExtracted = sorted.extracted.map((entry, index) => ({
      ...entry,
      descriptor: {
        kind: entry.descriptor.kind,
        id: entry.descriptor.id,
        ref: { ...entry.descriptor.ref },
        metadata: reorderJson(entry.descriptor.metadata, index + 17),
      },
      reference: {
        ...entry.reference,
        generationId: "pid-404-clock-20550101T000000Z",
      },
    }));
    expect(
      randomizedExtracted.some(
        (entry, index) =>
          Object.keys(entry.descriptor.metadata).join(",") !==
          Object.keys(sorted.extracted[index]?.descriptor.metadata ?? {}).join(","),
      ),
    ).toBe(true);
    const inserted = normalizeCompilation({
      extracted: randomizedExtracted,
      projectRoot: sorted.temporaryRoot,
    });

    expect(inserted.graphHash).toBe(sorted.graphHash);
    expect(inserted.outputs.graph).toBe(sorted.normalization.outputs.graph);
    expect(inserted.outputs.manifest).toBe(sorted.normalization.outputs.manifest);
    expect(inserted.outputs.diagnostics).toBe(sorted.normalization.outputs.diagnostics);
    // Phase 6 replaces these producers; byte equality is the contract they inherit.
    expect(inserted.outputs.openapi).toBe(sorted.normalization.outputs.openapi);
    expect(inserted.outputs.client).toBe(sorted.normalization.outputs.client);
  });

  test("normalizes Windows roots and excludes PID, clock, generation, and random metadata", () => {
    const first = volatileGraph("/tmp/zsys-determinism-a", false, 101, "early");
    const second = volatileGraph("C:\\zsys\\determinism-b", true, 202, "late");
    const firstOptions = { projectRoot: "/tmp/zsys-determinism-a" };
    const secondOptions = { projectRoot: "C:\\zsys\\determinism-b" };

    expect(canonicalGraphJson(second, secondOptions)).toBe(canonicalGraphJson(first, firstOptions));
    expect(hashGraph(second, secondOptions)).toBe(hashGraph(first, firstOptions));
  });

  test("matches clean compilation for watch add/change/remove cycles and preserves unaffected writes", async () => {
    const baseline = compileWatchState([
      functionDescriptor("orders.get", "src/functions/get.function.ts", "v1"),
      functionDescriptor("orders.other", "src/functions/other.function.ts", "v1"),
      routeDescriptor("orders.get", "src/routes/get.route.ts"),
    ]);
    const changedDescriptors = [
      functionDescriptor("orders.get", "src/functions/get.function.ts", "v2"),
      functionDescriptor("orders.other", "src/functions/other.function.ts", "v1"),
      routeDescriptor("orders.get", "src/routes/get.route.ts"),
    ];
    const changedInvalidation = invalidateWatchDependencies(
      baseline.watch,
      [".\\src\\functions\\get.function.ts"],
      WATCH_ROOT,
    );
    expect(changedInvalidation.changedDescriptorIds).toEqual(["orders.get"]);
    expect(changedInvalidation.affectedDescriptorIds).toEqual(["orders.get", "orders.route"]);
    expect(changedInvalidation.affectedFiles).toEqual([
      "src/functions/get.function.ts",
      "src/routes/get.route.ts",
    ]);
    expect(changedInvalidation.invalidatedArtifacts).toEqual([...WATCH_ARTIFACTS]);
    const changedIncremental = compileWatchCycle(baseline, changedDescriptors, [
      ".\\src\\functions\\get.function.ts",
    ]);
    const changedClean = compileWatchState([...changedDescriptors].reverse());
    expect(artifactSnapshot(changedIncremental.result)).toEqual(artifactSnapshot(changedClean));

    const added = functionDescriptor("orders.new", "src/functions/new.function.ts", "v1");
    const addedDescriptors = [...changedDescriptors, added];
    const addedIncremental = compileWatchCycle(baseline, addedDescriptors, [
      "src/functions/new.function.ts",
    ]);
    const addedInvalidation = addedIncremental.invalidation;
    expect(addedInvalidation.discoveryInvalidated).toBe(true);
    expect(addedInvalidation.invalidatedArtifacts).toEqual([...WATCH_ARTIFACTS]);
    expect(artifactSnapshot(addedIncremental.result)).toEqual(
      artifactSnapshot(compileWatchState([...addedDescriptors].reverse())),
    );

    const removedIncremental = compileWatchCycle(addedIncremental.result, changedDescriptors, [
      "src/functions/new.function.ts",
    ]);
    const removedInvalidation = removedIncremental.invalidation;
    expect(removedInvalidation.changedDescriptorIds).toEqual(["orders.new"]);
    expect(artifactSnapshot(removedIncremental.result)).toEqual(
      artifactSnapshot(compileWatchState([...changedDescriptors].reverse())),
    );

    const directory = await mkdtemp(join(tmpdir(), "zsys-watch-artifacts-"));
    try {
      await writeGeneratedArtifacts(baseline.outputs, { directory });
      const report = await writeGeneratedArtifacts(changedIncremental.result.outputs, {
        directory,
      });
      expect(report.writes.find((write) => write.fileName === "openapi.json")?.changed).toBe(true);
      expect(report.writes.find((write) => write.fileName === "client.ts")?.changed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function artifactSnapshot(run: FixtureCompilation | ReturnType<typeof compileWatchState>) {
  const outputs = "normalization" in run ? run.normalization.outputs : run.outputs;
  return {
    diagnostics: "diagnosticsBytes" in run ? run.diagnosticsBytes : outputs.diagnostics,
    graph: "graphBytes" in run ? run.graphBytes : outputs.graph,
    manifest: "manifest" in run ? run.manifest : outputs.manifest,
    hash: run.graphHash ?? "",
    openapi: outputs.openapi,
    client: outputs.client,
  };
}

function compileWatchState(descriptors: readonly unknown[]) {
  return normalizeCompilation({ descriptors, projectRoot: WATCH_ROOT });
}

function compileWatchCycle(
  previous: ReturnType<typeof compileWatchState>,
  descriptors: readonly unknown[],
  changedFiles: readonly string[],
) {
  return {
    invalidation: invalidateWatchDependencies(previous.watch, changedFiles, WATCH_ROOT),
    result: compileWatchState(descriptors),
  };
}

function functionDescriptor(id: string, source: string, version: string) {
  const outputSchema =
    version === "v1"
      ? z.object({ message: z.literal("v1") })
      : z.object({ message: z.literal("v2") });
  const descriptor = defineFunction({
    id,
    input,
    output: outputSchema,
    handler: async () => ({ message: version === "v1" ? "v1" : "v2" }),
  });
  return { ...descriptor, source: { file: source, line: 1, column: 1 } };
}

function routeDescriptor(targetId: string, source: string) {
  const target = functionDescriptor(targetId, "src/functions/get.function.ts", "v1");
  const descriptor = defineRoute({
    id: "orders.route",
    method: "GET",
    path: "/orders/:id",
    target,
    request: http.input({ id: http.path("id") }),
    responses: [http.success(200, target.output)],
  });
  return { ...descriptor, source: { file: source, line: 1, column: 1 } };
}

function reorderJson(value: JsonValue, seed: number): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => reorderJson(entry, seed + 1));
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, child]) => [key, reorderJson(child, seed + key.length)] as const,
    );
    entries.sort(
      ([left], [right]) => score(right, seed) - score(left, seed) || left.localeCompare(right),
    );
    return Object.fromEntries(entries) as JsonValue;
  }
  return value;
}

function score(value: string, seed: number): number {
  let result = seed;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result;
}

function volatileGraph(root: string, windows: boolean, pid: number, clock: string) {
  const file = (name: string) => (windows ? `${root}\\src\\${name}` : `${root}/src/${name}`);
  return {
    contractVersion: 1,
    appId: "determinism",
    generationId: `generation-${pid}`,
    timestamp: clock,
    pid,
    randomId: `random-${pid}`,
    nodes: [
      {
        kind: "app",
        id: "determinism",
        source: { file: file("app.ts"), line: 1, column: 1 },
        metadata: { pid, timestamp: clock },
      },
      {
        kind: "function",
        id: "orders.get",
        source: { file: file("functions/get.ts"), line: 2, column: 1 },
        output: { properties: { message: { type: "string" } } },
      },
    ],
    edges: [],
  };
}
