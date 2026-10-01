import { expect, test } from "vitest";
import { Effect } from "effect";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { graph } from "./fixtures/generator-graphs.js";
import { clientRoutes } from "../src/generate-types.js";
import {
  generateClientManifestEffect,
  generateClientRegistryEffect,
  generateClientRegistryFromDocumentEffect,
  publicFingerprintEffect,
} from "../src/generate-registry.js";
import { publicManifestEffect } from "../src/generate-public-manifest.js";
import {
  agentDocumentTypeEffect,
  arrayRecordsEffect,
  channelDocumentTypeEffect,
  publicAgentsEffect,
  publicChannelsEffect,
  selectorEffect,
  isRecord,
  isRecordEffect,
} from "../src/generate-registry-support.js";
test("generates stable manifests, fingerprints, and graph registry entries", () => {
  const first = graph(false);
  const second = graph(true);
  expect(Effect.runSync(publicFingerprintEffect(first))).toBe(
    Effect.runSync(publicFingerprintEffect(second)),
  );
  const manifest = JSON.parse(Effect.runSync(generateClientManifestEffect(first)));
  expect(manifest.publicFingerprint).toMatch(/^sha256:/);
  expect(manifest.routes[0].selector).toBe("GET /orders/:id");
  expect(Effect.runSync(publicManifestEffect(first))).toMatchObject({
    protocol: "relkit.client-manifest",
  });
  expect(Effect.runSync(generateClientRegistryEffect(first))).toContain('readonly "orders.get"');
  const streaming = {
    ...first,
    nodes: first.nodes.map((node) =>
      node.kind === "function"
        ? { ...node, output: { kind: "stream", item: { type: "string" } } }
        : node,
    ),
  } as ApplicationGraph;
  expect(Effect.runSync(generateClientRegistryEffect(streaming))).toContain("ClientStreamContract");
  expect(Effect.runSync(selectorEffect(clientRoutes(first)[0]!))).toBe("GET /orders/:id");
});
test("renders document routes, streams, channels, agents, and jobs", () => {
  const document = {
    procedures: [
      {
        name: "orders.get",
        selector: "GET /orders/:id",
        input: { type: "string" },
        output: { type: "number" },
      },
      {
        name: "events.listen",
        route: { operation: "mutation" },
        input: {},
        output: { kind: "stream", item: { type: "boolean" } },
      },
      null,
    ],
    channels: [
      {
        id: "updates",
        params: { type: "string" },
        events: { changed: { type: "boolean" } },
        presence: "count",
      },
      { id: 1 },
    ],
    agents: [
      { id: "assistant", input: { type: "string" }, output: { type: "string" } },
      { id: null },
    ],
    jobs: [
      {
        name: "exportOrders",
        jobId: "orders.export",
        taskId: "orders.export",
        taskVersion: "1",
        operations: ["trigger"],
        fields: [],
        streamNames: [],
        input: {},
        output: {},
      },
    ],
  };
  const text = Effect.runSync(generateClientRegistryFromDocumentEffect(document));
  expect(text).toContain('readonly "GET /orders/:id"');
  expect(text).toContain("ClientStreamContract");
  expect(text).toContain('readonly "updates"');
  expect(text).toContain('readonly "assistant"');
  expect(text).toContain('readonly "exportOrders"');
  expect(Effect.runSync(arrayRecordsEffect([null, {}, 1]))).toEqual([{}]);
  expect(Effect.runSync(arrayRecordsEffect(null))).toEqual([]);
  expect(Effect.runSync(isRecordEffect({ id: "orders.get" }))).toBe(true);
  expect(isRecord(["not a record"])).toBe(false);
  expect(
    Effect.runSync(channelDocumentTypeEffect({ presence: { member: { type: "string" } } })),
  ).toContain("MemberPresence<string>");
  expect(Effect.runSync(channelDocumentTypeEffect({ presence: {} }))).toContain("never>");
  expect(
    Effect.runSync(agentDocumentTypeEffect({ id: "assistant", input: {}, output: {} })),
  ).toContain("ClientAgentContract");
});
test("uses safe defaults for absent document sections and malformed outputs", () => {
  expect(Effect.runSync(generateClientRegistryFromDocumentEffect({}))).toContain(
    "interface ClientRegistry",
  );
  const output = Effect.runSync(
    generateClientRegistryFromDocumentEffect({
      procedures: [{ name: "broken.output", input: {}, output: null }],
    }),
  );
  expect(output).toContain('readonly "broken.output"');
  expect(output).toContain("ClientRouteContract");
  const input = graph(false);
  const nullOutput = {
    ...input,
    nodes: input.nodes.map((node) => (node.kind === "function" ? { ...node, output: null } : node)),
  } as ApplicationGraph;
  expect(Effect.runSync(generateClientRegistryEffect(nullOutput))).toContain("ClientRouteContract");
});
test("filters internal channels and non-client agents from graph registries", () => {
  const input: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "channel",
        id: "public",
        client: "public",
        params: {},
        events: { updated: { type: "string" }, created: { type: "boolean" } },
        source: { file: "channels.ts", line: 1, column: 1 },
      },
      {
        kind: "channel",
        id: "hidden",
        client: "internal",
        params: {},
        events: {},
        source: { file: "channels.ts", line: 2, column: 1 },
      },
      {
        kind: "agent",
        id: "assistant",
        client: "public",
        execution: "graph",
        input: {},
        output: {},
        source: { file: "agent.ts", line: 1, column: 1 },
      },
    ],
    edges: [],
  } as unknown as ApplicationGraph;
  expect(Effect.runSync(publicChannelsEffect(input)).map((entry) => entry.id)).toEqual(["public"]);
  expect(Effect.runSync(publicAgentsEffect(input)).map((entry) => entry.id)).toEqual(["assistant"]);
  const registry = Effect.runSync(generateClientRegistryEffect(input));
  expect(registry).toContain('readonly "public"');
  expect(registry).toContain('readonly "assistant"');
  expect(registry).not.toContain('readonly "hidden"');
  expect(Effect.runSync(publicManifestEffect(input))).toMatchObject({
    channels: [{ id: "public" }],
  });
});
