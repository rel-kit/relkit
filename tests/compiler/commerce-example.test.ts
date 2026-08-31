import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { hashGraph } from "../../packages/graph/src/index.ts";
import { compileProject } from "./fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");
const forbiddenNode = ["sub", "scription"].join("");
const DESCRIPTOR_IDS = [
  "commerce-api",
  "account",
  "account.account-session",
  "assets",
  "assets.objects",
  "assets.upload-assets",
  "auth",
  "database",
  "navigation",
  "navigation.browse-path",
  "orders.created",
  "orders.updated",
  "orders.cancelled",
  "receipts.on-order-created",
  "orders.audit-cancelled",
  "orders.audit-created",
  "orders.audit-updated",
  "orders.project-cancelled",
  "orders.project-created",
  "orders.project-updated",
  "telemetry.order-cancelled",
  "telemetry.order-created",
  "telemetry.order-updated",
  "orders.authorize-order",
  "orders.cancel-order",
  "orders.lookup-order",
  "orders.order-support",
  "orders.prices",
  "orders.create-order",
  "orders.delete-order",
  "orders.get-order",
  "orders.search-orders",
  "receipts",
  "receipts.send-receipt",
  "orders.update-order",
  "receipts.send-job",
  "telemetry",
  "users",
  "users.database-users",
  "order-auth",
  "route.all.api.auth.optional-catch-all-auth",
  "route.get.account.profile",
  "route.get.database.users",
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
  "orders.normalize-id",
  "orders",
];

describe("commerce-example compiler acceptance", () => {
  test("keeps authored contracts unique, hash-matched, and data-only", async () => {
    const run = await compileProject("commerce-example", APP_ROOT);
    const graph = JSON.parse(run.graphBytes) as Record<string, any>;

    expect(run.diagnostics).toEqual([]);
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
    expect(nodes.filter((node) => node.kind === "trigger")).toHaveLength(25);
    expect(
      nodes
        .filter((node) => node.triggerType === "event")
        .map((node) => node.id)
        .sort(),
    ).toEqual([
      "relkit.event.orders.audit-cancelled.trigger",
      "relkit.event.orders.audit-created.trigger",
      "relkit.event.orders.audit-updated.trigger",
      "relkit.event.orders.project-cancelled.trigger",
      "relkit.event.orders.project-created.trigger",
      "relkit.event.orders.project-updated.trigger",
      "relkit.event.receipts.on-order-created.trigger",
      "relkit.event.telemetry.order-cancelled.trigger",
      "relkit.event.telemetry.order-created.trigger",
      "relkit.event.telemetry.order-updated.trigger",
    ]);

    expect(edges.map(edgeKey).sort()).toEqual(
      [
        ["enqueues-job", "receipts.on-order-created", "receipts.send-job"],
        ["exposes-as-tool", "orders.delete-order", "orders.cancel-order"],
        ["exposes-as-tool", "orders.get-order", "orders.lookup-order"],
        ["publishes-event", "orders.create-order", "orders.created"],
        ["targets-function", "route.post.uploads", "assets.upload-assets", "primary"],
        ["targets-function", "route.get.account.profile", "account.account-session", "primary"],
        ["targets-function", "route.get.database.users", "users.database-users", "primary"],
        [
          "targets-function",
          "route.get.docs.optional-catch-all-parts",
          "navigation.browse-path",
          "primary",
        ],
        [
          "targets-function",
          "route.get.files.catch-all-parts",
          "navigation.browse-path",
          "primary",
        ],
        ["targets-function", "route.delete.orders.by-order-id", "orders.delete-order", "primary"],
        ["targets-function", "route.get.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.post.orders", "orders.create-order", "primary"],
        ["targets-function", "orders.cancel-order", "orders.delete-order", "primary"],
        ["targets-function", "orders.lookup-order", "orders.get-order", "primary"],
        ["targets-function", "route.head.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.get.orders", "orders.search-orders", "primary"],
        ["targets-function", "route.options.orders.by-order-id", "orders.get-order", "primary"],
        ["targets-function", "route.put.orders.by-order-id", "orders.update-order", "primary"],
        ["targets-function", "route.get.orders.search", "orders.search-orders", "primary"],
        ["targets-function", "route.patch.orders.by-order-id", "orders.update-order", "primary"],
        ["targets-function", "receipts.send-job", "receipts.send-receipt", "primary"],
        ["uses-bucket", "receipts.send-receipt", "assets.objects"],
        ["uses-bucket", "assets.upload-assets", "assets.objects"],
        ["uses-cache", "orders.create-order", "orders.prices"],
        ["uses-provider-profile", "assets.objects", "provider.buckets.default"],
        ["uses-provider-profile", "orders.order-support", "provider.models.default"],
        ["uses-provider-profile", "orders.prices", "provider.cache.default"],
        ["uses-provider-profile", "orders.created", "provider.events.default"],
        ["uses-provider-profile", "orders.updated", "provider.events.default"],
        ["uses-provider-profile", "orders.cancelled", "provider.events.default"],
        ["uses-provider-profile", "receipts.send-job", "provider.jobs.default"],
        ["uses-tool", "orders.order-support", "orders.lookup-order"],
        ["uses-middleware", "route.delete.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.get.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.get.orders.search", "order-auth", "0"],
        ["uses-middleware", "route.get.orders", "order-auth", "0"],
        ["uses-middleware", "route.head.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.options.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.patch.orders.by-order-id", "order-auth", "0"],
        ["uses-middleware", "route.post.orders", "order-auth", "0"],
        ["uses-middleware", "route.put.orders.by-order-id", "order-auth", "0"],
        ["declares-error", "orders.get-order", "orders.not-found"],
        ["depends-on-service", "auth", "database"],
        ["mounts-service", "route.all.api.auth.optional-catch-all-auth", "auth"],
        ["exposes-function", "account", "account.account-session", "accountSession", "0"],
        ["exposes-function", "assets", "assets.upload-assets", "uploadAssets", "0"],
        ["exposes-function", "navigation", "navigation.browse-path", "browsePath", "0"],
        ["exposes-function", "orders", "orders.authorize-order", "authorizeOrder", "0"],
        ["exposes-function", "orders", "orders.create-order", "createOrder", "1"],
        ["exposes-function", "orders", "orders.delete-order", "deleteOrder", "2"],
        ["exposes-function", "orders", "orders.get-order", "getOrder", "3"],
        ["exposes-function", "orders", "orders.search-orders", "searchOrders", "4"],
        ["exposes-function", "orders", "orders.update-order", "updateOrder", "5"],
        ["exposes-function", "receipts", "receipts.send-receipt", "sendReceipt", "0"],
        ["exposes-function", "users", "users.database-users", "databaseUsers", "0"],
        ["exposes-event", "orders", "orders.cancelled", "orderCancelled", "0"],
        ["exposes-event", "orders", "orders.created", "orderCreated", "1"],
        ["exposes-event", "orders", "orders.updated", "orderUpdated", "2"],
        [
          "targets-function",
          "relkit.event.orders.audit-cancelled.trigger",
          "orders.audit-cancelled",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.audit-cancelled.trigger", "orders.cancelled"],
        [
          "targets-function",
          "relkit.event.orders.audit-created.trigger",
          "orders.audit-created",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.audit-created.trigger", "orders.created"],
        [
          "targets-function",
          "relkit.event.orders.audit-updated.trigger",
          "orders.audit-updated",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.audit-updated.trigger", "orders.updated"],
        [
          "targets-function",
          "relkit.event.orders.project-cancelled.trigger",
          "orders.project-cancelled",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.project-cancelled.trigger", "orders.cancelled"],
        [
          "targets-function",
          "relkit.event.orders.project-created.trigger",
          "orders.project-created",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.project-created.trigger", "orders.created"],
        [
          "targets-function",
          "relkit.event.orders.project-updated.trigger",
          "orders.project-updated",
          "primary",
        ],
        ["listens-to-event", "relkit.event.orders.project-updated.trigger", "orders.updated"],
        [
          "targets-function",
          "relkit.event.receipts.on-order-created.trigger",
          "receipts.on-order-created",
          "primary",
        ],
        ["listens-to-event", "relkit.event.receipts.on-order-created.trigger", "orders.created"],
        [
          "targets-function",
          "relkit.event.telemetry.order-cancelled.trigger",
          "telemetry.order-cancelled",
          "primary",
        ],
        ["listens-to-event", "relkit.event.telemetry.order-cancelled.trigger", "orders.cancelled"],
        [
          "targets-function",
          "relkit.event.telemetry.order-created.trigger",
          "telemetry.order-created",
          "primary",
        ],
        ["listens-to-event", "relkit.event.telemetry.order-created.trigger", "orders.created"],
        [
          "targets-function",
          "relkit.event.telemetry.order-updated.trigger",
          "telemetry.order-updated",
          "primary",
        ],
        ["listens-to-event", "relkit.event.telemetry.order-updated.trigger", "orders.updated"],
        [
          "uses-provider-profile",
          "relkit.event.orders.audit-cancelled.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.orders.audit-created.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.orders.audit-updated.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.orders.project-cancelled.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.orders.project-created.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.orders.project-updated.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.receipts.on-order-created.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.telemetry.order-cancelled.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.telemetry.order-created.trigger",
          "provider.events.default",
        ],
        [
          "uses-provider-profile",
          "relkit.event.telemetry.order-updated.trigger",
          "provider.events.default",
        ],
      ].sort(),
    );

    expect(hashGraph(graph)).toBe(run.graphHash);
    expect(run.manifest.match(/manifestGraphHash = "([^"]+)"/)?.[1]).toBe(run.graphHash);

    const functionIds = run.normalization.descriptors
      .filter(({ kind, identity }) => kind === "function" && identity !== undefined)
      .map(({ id }) => id)
      .sort();
    const generatedFunctionId = "relkit.agent.orders.order-support.invoke";
    const eventFunctionIds = [
      "orders.audit-cancelled",
      "orders.audit-created",
      "orders.audit-updated",
      "orders.project-cancelled",
      "orders.project-created",
      "orders.project-updated",
      "receipts.on-order-created",
      "telemetry.order-cancelled",
      "telemetry.order-created",
      "telemetry.order-updated",
    ];
    expect(nodes.filter((node) => node.id === generatedFunctionId)).toHaveLength(1);
    expect(nodes.find((node) => node.id === generatedFunctionId)).toMatchObject({
      kind: "function",
      generated: {
        generated: true,
        generatedBy: "agent",
        agentId: "orders.order-support",
        functionId: generatedFunctionId,
      },
    });
    expect(mapIds(run.manifest, "functions")).toEqual(
      expect.arrayContaining([...functionIds, generatedFunctionId, ...eventFunctionIds]),
    );
    expect(run.manifest.match(/__relkit_createGeneratedAgentFunction\(/g)).toHaveLength(1);
    expect(run.manifest.match(/__relkit_bindFunctionEvents\(/g)).toHaveLength(11);
    for (const functionId of eventFunctionIds) {
      expect(nodes.find((node) => node.id === functionId)).toMatchObject({
        kind: "function",
        invocationMode: "event-only",
      });
    }
    expect(run.manifest.match(/^const __relkit_middleware_\d+ =/gm) ?? []).toHaveLength(0);
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
      "ALL",
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
      maxBodyBytes: 10 * 1024 * 1024,
      request: {
        fields: {
          primary: { kind: "multipart", name: "primary" },
          attachments: { kind: "multipart-all", name: "attachments" },
        },
      },
    });
    expect(nodes.find((node) => node.id === "route.get.orders")?.config).toMatchObject({
      method: "GET",
      path: "/orders",
    });
    expect(nodes.find((node) => node.id === "orders")?.functions).toHaveLength(6);
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
    expect(run.graphBytes).not.toContain("relkit-synthetic-openai-secret");
    expect(run.manifest).not.toContain("relkit-synthetic-openai-secret");
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
  ).toEqual(["assets.objects", "orders.prices"]);
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
  expect(manifest).not.toMatch(/import \* as __relkit_module_\d+ from ["']\//);
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
    const expectedId = `relkit.agent.${agent.id}.invoke`;
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
    const expression = `__relkit_createGeneratedAgentFunction(${JSON.stringify(agent.id)})`;
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
