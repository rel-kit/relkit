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
  "orders.authorize",
  "content.browse-path",
  "orders.create",
  "orders.delete",
  "orders.get",
  "orders.search",
  "receipts.send",
  "orders.update",
  "assets.upload",
  "receipts.send-job",
  "orders.auth",
  "docs.browse",
  "files.browse",
  "orders.delete.http",
  "orders.get-route",
  "orders.head",
  "orders.list.http",
  "orders.options",
  "orders.replace",
  "orders.search.http",
  "orders.update.http",
  "orders.create.http",
  "assets.upload.http",
  "orders.normalize-id",
  "orders.get.tool",
  "support.order",
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
    expect(run.extracted.map(({ descriptor }) => descriptor.id).sort()).toEqual(
      [...DESCRIPTOR_IDS].sort(),
    );
    expect(unique(run.extracted.map(({ descriptor }) => descriptor.id))).toHaveLength(
      DESCRIPTOR_IDS.length,
    );
    expect(
      unique(
        run.extracted.map(
          ({ descriptor, source }) =>
            `${descriptor.id}@${source.file}:${source.line}:${source.column}`,
        ),
      ),
    ).toHaveLength(DESCRIPTOR_IDS.length);

    const nodes = graph.nodes as readonly Record<string, any>[];
    const edges = graph.edges as readonly Record<string, any>[];
    expect(unique(nodes.map((node) => node.id))).toHaveLength(nodes.length);
    expect(
      nodes
        .filter((node) => DESCRIPTOR_IDS.includes(node.id))
        .map((node) => node.id)
        .sort(),
    ).toEqual(
      DESCRIPTOR_IDS.filter((id) => !["orders.auth", "orders.normalize-id"].includes(id)).sort(),
    );
    expect(unique(edges.map(edgeKey))).toHaveLength(edges.length);
    expect(nodes.filter((node) => node.kind === "trigger")).toHaveLength(16);
    expect(
      nodes
        .filter((node) => node.kind === "trigger")
        .map((node) => node.id)
        .sort(),
    ).toEqual([
      "assets.upload.http",
      "docs.browse",
      "files.browse",
      "orders.audit-changes",
      "orders.create.http",
      "orders.delete.http",
      "orders.get-route",
      "orders.head",
      "orders.list.http",
      "orders.options",
      "orders.project-any-change",
      "orders.replace",
      "orders.search.http",
      "orders.update.http",
      "receipts.on-order-created",
      "telemetry.capture-events",
    ]);

    expect(edges.map(edgeKey).sort()).toEqual(
      [
        ["calls-function", "zsys.event.receipts.on-order-created.handler", "orders.get"],
        ["enqueues-job", "orders.create", "receipts.send-job"],
        ["enqueues-job", "zsys.event.receipts.on-order-created.handler", "receipts.send-job"],
        ["exposes-as-tool", "orders.get", "orders.get.tool"],
        ["listens-to-event", "receipts.on-order-created", "orders.created"],
        ["listens-to-event", "orders.project-any-change", "orders.cancelled"],
        ["listens-to-event", "orders.project-any-change", "orders.created"],
        ["listens-to-event", "orders.project-any-change", "orders.updated"],
        ["listens-to-event", "orders.audit-changes", "orders.cancelled"],
        ["listens-to-event", "orders.audit-changes", "orders.created"],
        ["listens-to-event", "orders.audit-changes", "orders.updated"],
        ["publishes-event", "orders.create", "orders.created"],
        ["targets-function", "assets.upload.http", "assets.upload", "primary"],
        ["targets-function", "docs.browse", "content.browse-path", "primary"],
        ["targets-function", "files.browse", "content.browse-path", "primary"],
        ["targets-function", "orders.delete.http", "orders.delete", "primary"],
        ["targets-function", "orders.get-route", "orders.authorize", "middleware"],
        ["targets-function", "orders.get-route", "orders.get", "primary"],
        ["targets-function", "orders.create.http", "orders.create", "primary"],
        ["targets-function", "orders.get.tool", "orders.get", "primary"],
        ["targets-function", "orders.head", "orders.get", "primary"],
        ["targets-function", "orders.list.http", "orders.search", "primary"],
        ["targets-function", "orders.options", "orders.get", "primary"],
        ["targets-function", "orders.replace", "orders.update", "primary"],
        ["targets-function", "orders.search.http", "orders.search", "primary"],
        ["targets-function", "orders.update.http", "orders.update", "primary"],
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
        ["targets-function", "receipts.send-job", "receipts.send", "primary"],
        ["uses-bucket", "receipts.send", "assets"],
        ["uses-cache", "orders.create", "prices"],
        ["uses-cache", "orders.list.http", "prices"],
        ["uses-provider-profile", "assets", "default"],
        ["uses-provider-profile", "support.order", "default"],
        ["uses-provider-profile", "prices", "default"],
        ["uses-provider-profile", "receipts.on-order-created", "default"],
        ["uses-provider-profile", "orders.project-any-change", "default"],
        ["uses-provider-profile", "orders.audit-changes", "default"],
        ["uses-provider-profile", "telemetry.capture-events", "default"],
        ["uses-provider-profile", "receipts.send-job", "default"],
        ["uses-tool", "support.order", "orders.get.tool"],
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

    const functionIds = run.extracted
      .filter(({ descriptor }) => descriptor.kind === "function")
      .map(({ descriptor }) => descriptor.id)
      .sort();
    const generatedFunctionId = "zsys.agent.support.order.invoke";
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
        agentId: "support.order",
        functionId: generatedFunctionId,
      },
    });
    expect(mapIds(run.manifest, "functions")).toEqual([
      ...functionIds,
      generatedFunctionId,
      ...eventFunctionIds,
    ]);
    expect(run.manifest.match(/__zsys_createGeneratedAgentFunction\(/g)).toHaveLength(1);
    expect(run.manifest.match(/__zsys_createEventListenerTarget\(/g)).toHaveLength(4);
    for (const functionId of eventFunctionIds) {
      expect(nodes.find((node) => node.id === functionId)).toMatchObject({
        kind: "function",
        generated: { generated: true, generatedBy: "event-listener", functionId },
      });
    }
    expect(run.manifest.match(/^const __zsys_middleware_\d+ =/gm)).toHaveLength(1);
    expect(mapIds(run.manifest, "middleware")).toEqual(["orders.auth"]);
    expect(mapIds(run.manifest, "requestTransforms")).toEqual(["orders.normalize-id"]);

    const route = nodes.find((node) => node.id === "orders.get-route");
    expect(route?.config.middleware).toEqual([
      { id: "orders.auth", targetFunctionId: "orders.authorize" },
    ]);
    expect(route?.config.transforms).toEqual([
      expect.objectContaining({ id: "orders.normalize-id" }),
    ]);

    const createRoute = nodes.find((node) => node.id === "orders.create.http");
    expect(createRoute?.targetFunctionId).toBe("orders.create");
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
    expect(nodes.find((node) => node.id === "docs.browse")?.config).toMatchObject({
      path: "/docs/*parts?",
      runtimePaths: ["/docs", "/docs/:parts{.+}"],
    });
    expect(nodes.find((node) => node.id === "files.browse")?.config).toMatchObject({
      path: "/files/*parts",
      runtimePaths: ["/files/:parts{.+}"],
    });
    expect(nodes.find((node) => node.id === "assets.upload.http")?.config).toMatchObject({
      maxBodyBytes: 1_024,
      request: {
        fields: {
          primary: { kind: "multipart", name: "primary" },
          attachments: { kind: "multipart-all", name: "attachments" },
        },
      },
    });
    expect(nodes.find((node) => node.id === "orders.list.http")?.config).toMatchObject({
      rateLimit: { limit: 2, windowMs: 60_000, storeId: "prices" },
      responses: expect.arrayContaining([expect.objectContaining({ status: 429 })]),
    });

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
  return [edge.kind, edge.from, edge.to, ...(edge.role === undefined ? [] : [edge.role])];
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
    /^(?:api[-_]?key|access[-_]?key|client|credential(?:s)?|endpoint|model(?:id|name)?|provider|sdk|secret(?:key)?|token)$/i;
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
