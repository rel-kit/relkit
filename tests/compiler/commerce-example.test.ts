import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { hashGraph } from "../../packages/graph/src/index.ts";
import { compileProject } from "./fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");
const forbiddenNode = ["sub", "scription"].join("");
const DESCRIPTOR_IDS = [
  "commerce-api",
  "assets",
  "prices",
  "orders.created",
  "orders.updated",
  "orders.cancelled",
  "receipts.on-order-created",
  "orders.project-any-change",
  "orders.audit-changes",
  "telemetry.capture-events",
  "authorize-order",
  "browse-path",
  "orders.create-order",
  "orders.delete-order",
  "orders.get-order",
  "orders.search-orders",
  "send-receipt",
  "orders.update-order",
  "upload-assets",
  "receipts.send-job",
  "order-auth",
  "route.get.docs.optional-catch-all-parts",
  "route.get.files.catch-all-parts",
  "route.delete.orders.by-order-id",
  "route.get.orders.by-order-id",
  "route.head.orders.by-order-id",
  "route.get.orders",
  "route.options.orders.by-order-id",
  "route.put.orders.by-order-id",
  "route.get.orders.search",
  "route.patch.orders.by-order-id",
  "route.post.orders",
  "route.post.uploads",
  "orders",
  "orders.normalize-id",
  "lookup-order",
  "order-support",
];

describe("commerce-example compiler acceptance", () => {
  test("keeps authored contracts unique, hash-matched, and data-only", async () => {
    const run = await compileProject("commerce-example", APP_ROOT);
    const graph = JSON.parse(run.graphBytes) as Record<string, any>;

    expect(run.diagnostics).toEqual([
      expect.objectContaining({
        code: "ZSYS_EVENT_WILDCARD_RESTRICTED",
        severity: "warning",
        message: "Raw all-event selector is restricted to telemetry.",
      }),
    ]);
    expect(run.exitCode).toBe(0);
    const authoredIds = run.normalization.descriptors
      .filter(({ identity }) => identity !== undefined)
      .map(({ id }) => id)
      .sort();
    expect(authoredIds).toEqual([...DESCRIPTOR_IDS].sort());
    expect(run.extracted).toHaveLength(DESCRIPTOR_IDS.length);
    expect(
      unique(run.extracted.map(({ source }) => `${source.file}:${source.line}:${source.column}`)),
    ).toHaveLength(DESCRIPTOR_IDS.length);

    const nodes = graph.nodes as readonly Record<string, any>[];
    const edges = graph.edges as readonly Record<string, any>[];
    expect(unique(nodes.map((node) => node.id))).toHaveLength(nodes.length);
    expect(
      nodes
        .filter((node) => DESCRIPTOR_IDS.includes(node.id))
        .map((node) => node.id)
        .sort(),
    ).toEqual(DESCRIPTOR_IDS.filter((id) => id !== "orders.normalize-id").sort());
    expect(unique(edges.map(edgeKey))).toHaveLength(edges.length);
    expect(nodes.filter((node) => node.kind === "trigger")).toHaveLength(16);
    expect(
      nodes
        .filter((node) => node.kind === "trigger")
        .map((node) => node.id)
        .sort(),
    ).toEqual(
      [
        "route.post.uploads",
        "route.get.docs.optional-catch-all-parts",
        "route.get.files.catch-all-parts",
        "orders.audit-changes",
        "orders.project-any-change",
        "route.post.orders",
        "route.delete.orders.by-order-id",
        "route.get.orders.by-order-id",
        "route.head.orders.by-order-id",
        "route.get.orders",
        "route.options.orders.by-order-id",
        "route.put.orders.by-order-id",
        "route.get.orders.search",
        "route.patch.orders.by-order-id",
        "receipts.on-order-created",
        "telemetry.capture-events",
      ].sort(),
    );

    expect(edges.map(edgeKey).sort()).toEqual(
      [
        ["enqueues-job", "orders.create-order", "receipts.send-job"],
        ["enqueues-job", "zsys.event.receipts.on-order-created.handler", "receipts.send-job"],
        ["exposes-as-tool", "orders.get-order", "lookup-order"],
        ["listens-to-event", "receipts.on-order-created", "orders.created"],
        ["listens-to-event", "orders.project-any-change", "orders.cancelled"],
        ["listens-to-event", "orders.project-any-change", "orders.created"],
        ["listens-to-event", "orders.project-any-change", "orders.updated"],
        ["listens-to-event", "orders.audit-changes", "orders.cancelled"],
        ["listens-to-event", "orders.audit-changes", "orders.created"],
        ["listens-to-event", "orders.audit-changes", "orders.updated"],
        ["publishes-event", "orders.create-order", "orders.created"],
        ["targets-function", "route.post.uploads", "upload-assets", "primary"],
        ["targets-function", "route.get.docs.optional-catch-all-parts", "browse-path", "primary"],
        ["targets-function", "route.get.files.catch-all-parts", "browse-path", "primary"],
        ["targets-function", "route.delete.orders.by-order-id", "orders.delete-order", "primary"],
        ["targets-function", "route.get.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.post.orders", "orders.create-order", "primary"],
        ["targets-function", "lookup-order", "orders.get-order", "primary"],
        ["targets-function", "route.head.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.get.orders", "orders.search-orders", "primary"],
        ["targets-function", "route.options.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.put.orders.by-order-id", "orders.update-order", "primary"],
        ["targets-function", "route.get.orders.search", "orders.search-orders", "primary"],
        ["targets-function", "route.patch.orders.by-order-id", "orders.update-order", "primary"],
        [
          "targets-function",
          "receipts.on-order-created",
          "zsys.event.receipts.on-order-created.handler",
          "primary",
        ],
        [
          "targets-function",
          "orders.project-any-change",
          "zsys.event.orders.project-any-change.handler",
          "primary",
        ],
        [
          "targets-function",
          "orders.audit-changes",
          "zsys.event.orders.audit-changes.handler",
          "primary",
        ],
        [
          "targets-function",
          "telemetry.capture-events",
          "zsys.event.telemetry.capture-events.handler",
          "primary",
        ],
        ["targets-function", "receipts.send-job", "send-receipt", "primary"],
        ["uses-bucket", "send-receipt", "assets"],
        ["uses-cache", "orders.create-order", "prices"],
        ["uses-cache", "route.get.orders", "prices"],
        ["uses-provider-profile", "assets", "provider.buckets.default"],
        ["uses-provider-profile", "order-support", "provider.models.default"],
        ["uses-provider-profile", "prices", "provider.cache.default"],
        ["uses-provider-profile", "orders.created", "provider.events.default"],
        ["uses-provider-profile", "orders.updated", "provider.events.default"],
        ["uses-provider-profile", "orders.cancelled", "provider.events.default"],
        ["uses-provider-profile", "receipts.on-order-created", "provider.events.default"],
        ["uses-provider-profile", "orders.project-any-change", "provider.events.default"],
        ["uses-provider-profile", "orders.audit-changes", "provider.events.default"],
        ["uses-provider-profile", "telemetry.capture-events", "provider.events.default"],
        ["uses-provider-profile", "receipts.send-job", "provider.jobs.default"],
        ["uses-tool", "order-support", "lookup-order"],
        ["uses-middleware", "route.delete.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.get.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.get.orders.search", "order-auth", "0"],
        ["uses-middleware", "route.get.orders", "order-auth", "0"],
        ["uses-middleware", "route.head.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.options.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.patch.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.post.orders", "order-auth", "0"],
        ["uses-middleware", "route.put.orders.by-order-id", "order-auth", "0"],
        ["contains-function", "orders", "orders.create-order", "createOrder", "0"],
        ["contains-function", "orders", "orders.delete-order", "deleteOrder", "1"],
        ["contains-function", "orders", "orders.get-order", "getOrder", "2"],
        ["contains-function", "orders", "orders.search-orders", "searchOrders", "3"],
        ["contains-function", "orders", "orders.update-order", "updateOrder", "4"],
        ["uses-service-middleware", "orders", "orders.context", "0"],
      ].sort(),
    );

    expect(nodes.find((node) => node.id === "orders.project-any-change")?.config).toMatchObject({
      expansion: ["orders.cancelled@1", "orders.created@1", "orders.updated@1"],
    });
    expect(nodes.find((node) => node.id === "orders.audit-changes")?.config).toMatchObject({
      expansion: ["orders.cancelled@1", "orders.created@1", "orders.updated@1"],
    });
    expect(nodes.find((node) => node.id === "telemetry.capture-events")?.config).toMatchObject({
      selector: { kind: "all", payload: "unknown", purpose: "telemetry" },
      expansion: [],
      delivery: "ephemeral",
    });

    expect(hashGraph(graph)).toBe(run.graphHash);
    expect(run.manifest.match(/manifestGraphHash = "([^"]+)"/)?.[1]).toBe(run.graphHash);

    const functionIds = run.normalization.descriptors
      .filter(({ kind, identity }) => kind === "function" && identity !== undefined)
      .map(({ id }) => id)
      .sort();
    const generatedFunctionId = "zsys.agent.order-support.invoke";
    const eventFunctionIds = [
      "zsys.event.orders.audit-changes.handler",
      "zsys.event.orders.project-any-change.handler",
      "zsys.event.receipts.on-order-created.handler",
      "zsys.event.telemetry.capture-events.handler",
    ];
    expect(nodes.filter((node) => node.id === generatedFunctionId)).toHaveLength(1);
    expect(nodes.find((node) => node.id === generatedFunctionId)).toMatchObject({
      kind: "function",
      generated: {
        generated: true,
        generatedBy: "agent",
        agentId: "order-support",
        functionId: generatedFunctionId,
      },
    });
    expect(mapIds(run.manifest, "functions")).toEqual(
      expect.arrayContaining([...functionIds, generatedFunctionId, ...eventFunctionIds]),
    );
    expect(run.manifest.match(/__zsys_createGeneratedAgentFunction\(/g)).toHaveLength(1);
    expect(run.manifest.match(/__zsys_createEventListenerTarget\(/g)).toHaveLength(4);
    for (const functionId of eventFunctionIds) {
      expect(nodes.find((node) => node.id === functionId)).toMatchObject({
        kind: "function",
        generated: { generated: true, generatedBy: "event-listener", functionId },
      });
    }
    expect(run.manifest.match(/^const __zsys_middleware_\d+ =/gm) ?? []).toHaveLength(0);
    expect(mapIds(run.manifest, "middleware")).toEqual(["order-auth"]);
    expect(mapIds(run.manifest, "requestTransforms")).toEqual(["orders.normalize-id"]);

    const route = nodes.find((node) => node.id === "route.get.orders.by-order-id");
    expect(route?.config.middleware).toEqual([
      { id: "order-auth", path: "/orders/*", order: 0, match: "always" },
    ]);
    expect(route?.config.transforms).toEqual([
      expect.objectContaining({ id: "orders.normalize-id" }),
    ]);

    const createRoute = nodes.find((node) => node.id === "route.post.orders");
    expect(createRoute?.targetFunctionId).toBe("orders.create-order");
    expect(createRoute?.config).toMatchObject({
      method: "POST",
      path: "/orders",
      request: {
        kind: "input",
        fields: {
          orderId: { kind: "header", name: "idempotency-key" },
          customerEmail: { kind: "header", name: "x-customer-email" },
          sku: { kind: "body", name: "sku" },
          quantity: { kind: "body", name: "quantity" },
        },
      },
    });

    const httpRoutes = nodes.filter((node) => node.triggerType === "http");
    expect([...new Set(httpRoutes.map((node) => node.config.method))].sort()).toEqual([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]);
    expect(
      nodes.find((node) => node.id === "route.get.docs.optional-catch-all-parts")?.config,
    ).toMatchObject({
      path: "/docs/*parts?",
      runtimePaths: ["/docs", "/docs/:parts{.+}"],
    });
    expect(
      nodes.find((node) => node.id === "route.get.files.catch-all-parts")?.config,
    ).toMatchObject({
      path: "/files/*parts",
      runtimePaths: ["/files/:parts{.+}"],
    });
    expect(nodes.find((node) => node.id === "route.post.uploads")?.config).toMatchObject({
      maxBodyBytes: 1_024,
      request: {
        fields: {
          primary: { kind: "multipart", name: "primary" },
          attachments: { kind: "multipart-all", name: "attachments" },
        },
      },
    });
    expect(nodes.find((node) => node.id === "route.get.orders")?.config).toMatchObject({
      rateLimit: { limit: 2, windowMs: 60_000, storeId: "prices" },
      responses: expect.arrayContaining([expect.objectContaining({ status: 429 })]),
    });
    expect(nodes.find((node) => node.id === "orders")?.middleware).toEqual([
      { id: "orders.context" },
    ]);
    expect(nodes.find((node) => node.id === "orders.get-order")?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "orders.not-found", retry: "later", afterMs: 1_000 }),
      ]),
    );

    assertDataOnly(graph, run.manifest);
    assertDataOnly(run.extracted, run.manifest);
    assertLogicalResourceDescriptors(run.extracted);
    expect(agentBoundaryViolations(nodes, run.manifest)).toEqual([]);
    expect(nodes.some((node) => node.kind === forbiddenNode)).toBe(false);
    expect(run.graphBytes.toLowerCase()).not.toContain(forbiddenNode);
    expect(run.graphBytes).not.toContain("zsys-synthetic-openai-secret");
    expect(run.manifest).not.toContain("zsys-synthetic-openai-secret");
  });
});

function mapIds(source: string, property: string): string[] {
  const line = source.split("\n").find((entry) => entry.trimStart().startsWith(`${property}:`));
  return [...(line?.matchAll(/"([^"]+)":/g) ?? [])].map((match) => match[1]!);
}

function assertLogicalResourceDescriptors(
  extracted: readonly { readonly descriptor: unknown }[],
): void {
  const resources = extracted.filter(({ descriptor }) => {
    const value = descriptor as { readonly kind?: unknown };
    return value.kind === "bucket" || value.kind === "cache";
  });
  expect(
    resources.map(({ descriptor }) => (descriptor as { readonly id: string }).id).sort(),
  ).toEqual(["assets", "prices"]);
  for (const resource of resources) {
    walk(resource.descriptor, (key, value) => {
      expect(key).not.toMatch(
        /(?:path|root|endpoint|vendor|sdk|client|credential|secret|factory)/i,
      );
      if (typeof value === "string") {
        expect(value).not.toMatch(/(?:@aws-sdk|node:(?:fs|path)|pulumi|[A-Za-z]:[\\/]|^\/)/i);
      }
    });
  }
}

function edgeKey(edge: Record<string, any>): string[] {
  return [
    edge.kind,
    edge.from,
    edge.to,
    ...(edge.role === undefined ? [] : [edge.role]),
    ...(edge.member === undefined ? [] : [edge.member]),
    ...(edge.order === undefined ? [] : [String(edge.order)]),
  ];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function assertDataOnly(graph: unknown, manifest: string): void {
  walk(graph, (key, value) => {
    if (key === "source" && isRecord(value) && isAbsolutePath(value.file)) {
      throw new Error(`absolute source path: ${value.file}`);
    }
    if (/client/i.test(key) || key === "handler") {
      if (typeof value === "function" || (isRecord(value) && typeof value.value === "string")) {
        throw new Error(`executable/provider value at ${key}`);
      }
    }
    if (/api.?key/i.test(key) && typeof value === "string") {
      throw new Error(`resolved secret at ${key}`);
    }
  });
  expect(manifest).not.toMatch(/import \* as __zsys_module_\d+ from ["']\//);
  expect(manifest).not.toContain("[Function");
  expect(manifest).not.toContain("/Users/");
}

function agentBoundaryViolations(
  nodes: readonly Record<string, any>[],
  manifest: string,
): string[] {
  const findings: string[] = [];
  const agents = nodes.filter((node) => node.kind === "agent");
  const forbidden =
    /^(?:api[-_]?key|access[-_]?key|client|credential(?:s)?|endpoint|model(?:id|name)|provider|sdk|secret(?:key)?|token)$/i;
  for (const tool of nodes.filter((node) => node.kind === "tool")) {
    if (Object.prototype.hasOwnProperty.call(tool, "handler"))
      findings.push(`${tool.id}:tool-handler`);
  }
  for (const agent of agents) {
    for (const key of Object.keys(agent)) {
      if (forbidden.test(key)) findings.push(`${agent.id}:agent-provider-details:${key}`);
    }
    const marker = agent.generatedFunction;
    const expectedId = `zsys.agent.${agent.id}.invoke`;
    if (
      !isRecord(marker) ||
      marker.generated !== true ||
      marker.generatedBy !== "agent" ||
      marker.agentId !== agent.id ||
      marker.functionId !== expectedId
    )
      findings.push(`${agent.id}:generated-agent-marker`);
    const generated = nodes.filter((node) => node.kind === "function" && node.id === expectedId);
    if (generated.length !== 1) findings.push(`${agent.id}:generated-function-count`);
    if (JSON.stringify(generated[0]?.generated) !== JSON.stringify(marker))
      findings.push(`${agent.id}:generated-function-marker`);
    const expression = `__zsys_createGeneratedAgentFunction(${JSON.stringify(agent.id)})`;
    if (manifest.split(expression).length - 1 !== 1) findings.push(`${agent.id}:manifest-handler`);
  }
  return findings;
}

function walk(value: unknown, visit: (key: string, value: unknown) => void, key = ""): void {
  visit(key, value);
  if (Array.isArray(value)) {
    value.forEach((entry) => walk(entry, visit, key));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([childKey, childValue]) => walk(childValue, visit, childKey));
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): boolean {
  return typeof value === "string" && (/^\//.test(value) || /^[A-Za-z]:[\\/]/.test(value));
}
