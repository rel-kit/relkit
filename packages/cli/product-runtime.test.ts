/** Verifies emitted native-agent execution, live redaction, and correlated observability history. */
import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { buildProject } from "./src/commands/build.js";
import { openProductInspection } from "../../tests/fixtures/cli/product-inspection.js";
import { linkWorkspacePackages } from "./test-workspace.js";
import {
  eventually,
  invoke,
  page,
  readChunk,
  requestDetailSchema,
} from "./product-runtime.fixture.js";

const roots: string[] = [];

test("the emitted full-graph server runs agents and correlated observability", async () => {
  const root = await copyFullProject();
  await configureProductFixture(root);
  const built = await buildProject({ projectRoot: root });
  expect(built).toMatchObject({ ok: true });
  if (built.graphHash === undefined) throw new Error("Built graph hash is unavailable.");
  const started = await openProductInspection(root);
  const base = started.inspection;
  const streamController = new AbortController();
  const streamResponse = fetch(`${base}/_relkit/v1/stream`, { signal: streamController.signal });
  void streamResponse.catch(() => undefined);
  try {
    expect((await page(base, "/routes")).items).toContainEqual(
      expect.objectContaining({ id: "orders.get-route" }),
    );
    expect((await page(base, "/functions")).items).toContainEqual(
      expect.objectContaining({ id: "orders.create" }),
    );
    const requestId = await verifyRouteStream(base, built.graphHash, streamResponse);
    streamController.abort();
    await verifyAgentDetail(base, built.graphHash, requestId);
    await verifyHistory(base, built.graphHash, requestId);
  } finally {
    streamController.abort();
    await started.close();
  }
}, 60_000);

async function verifyRouteStream(
  base: string,
  graphHash: string,
  streamResponse: Promise<Response>,
) {
  const route = await fetch(`${base}/orders/order-1`, {
    headers: { authorization: "allowed" },
  });
  expect(route.status).toBe(200);
  const requestId = route.headers.get("x-request-id");
  expect(requestId).toBeTruthy();

  const created = await invoke(base, graphHash, "orders.create", {
    orderId: "order-1",
    sku: "pre-sink-secret",
  });
  expect(created.status).toBe(200);
  expect(await created.json()).toMatchObject({ output: { orderId: "order-1" } });

  const live = await streamResponse;
  expect(live.headers.get("content-type")).toContain("text/event-stream");
  const chunk = await readChunk(live);
  expect(chunk).toContain("event:");
  expect(chunk).not.toContain("pre-sink-secret");
  return requestId;
}

async function verifyAgentDetail(base: string, graphHash: string, requestId: string | null) {
  const agent = await invoke(base, graphHash, "relkit.agent.orders.support-agent.invoke", {
    question: "Where is order-1?",
  });
  const agentBody = await agent.json();
  if (agent.status !== 200) throw new Error(JSON.stringify(agentBody));
  expect(agentBody).toMatchObject({ output: { answer: "local answer" } });

  const expected = {
    request: {
      requestId,
      functionId: "orders.get",
    },
    spans: expect.arrayContaining([
      expect.objectContaining({ functionId: "orders.get", status: "completed" }),
    ]),
  };
  let detail: typeof requestDetailSchema.Type | undefined;
  await eventually(async () => {
    const response = await fetch(`${base}/_relkit/v1/requests/${requestId}`);
    if (response.status !== 200) return false;
    detail = Schema.decodeUnknownSync(requestDetailSchema)(await response.json());
    return (
      detail.request.requestId === requestId &&
      detail.request.functionId === "orders.get" &&
      detail.spans.some((span) => span.functionId === "orders.get" && span.status === "completed")
    );
  });
  expect(detail).toMatchObject(expected);
}

async function verifyHistory(base: string, graphHash: string, requestId: string | null) {
  await invoke(base, graphHash, "orders.create", {
    orderId: "order-2",
    sku: "second-secret",
  });
  expect(
    await eventually(
      async () => (await page(base, "/logs?functionId=orders.create&limit=2")).items.length === 2,
    ),
  ).toBe(true);
  const logs = await page(base, "/logs?functionId=orders.create&limit=1");
  expect(logs.items[0]).toMatchObject({ fields: {} });
  expect(JSON.stringify(logs)).not.toContain("pre-sink-secret");
  expect(logs.nextCursor).toBeDefined();
  const continued = await page(
    base,
    `/logs?functionId=orders.create&limit=1&cursor=${logs.nextCursor}`,
  );
  expect(continued.items).toHaveLength(1);
  expect(logs.items[0]?.invocationId).toBeString();
  expect(continued.items[0]?.invocationId).toBeString();
  expect(continued.items[0]?.invocationId).not.toBe(logs.items[0]?.invocationId);

  await expect(
    eventually(async () => {
      const traces = await page(
        base,
        "/traces?functionId=relkit.agent.orders.support-agent.invoke&limit=20",
      );
      return traces.items.length > 0;
    }),
  ).resolves.toBe(true);
  const requests = await page(base, "/requests?limit=100");
  expect(requests.items).toHaveLength(1);
  expect(requests.items[0]).toMatchObject({ requestId });
}

async function configureProductFixture(root: string): Promise<void> {
  const configPath = join(root, "relkit.config.ts");
  await writeFile(
    configPath,
    (await readFile(configPath, "utf8")).replace(
      "defineApp({",
      "defineApp({ inspector: { enabled: true },",
    ),
  );
  const agentPath = join(root, "src/orders/agents/order-support.agent.ts");
  const agent = await readFile(agentPath, "utf8");
  await writeFile(
    agentPath,
    agent
      .replace(
        'import { defineAgent } from "@relkit/langchain";',
        'import { defineAgent } from "@relkit/langchain";\nimport { createTestModel } from "@relkit/langchain/testing";',
      )
      .replace(
        /const fixtureModel = \{[\s\S]*?\} as never;/,
        `const fixtureModel = createTestModel({
  script: [{ type: "final", output: { answer: "local answer" } }],
}).languageModel;`,
      ),
  );
  const functionPath = join(root, "src/orders/functions/create-order.function.ts");
  const source = await readFile(functionPath, "utf8");
  await writeFile(
    functionPath,
    source
      .replace('import prices from "../cache/prices.cache.js";\n', "")
      .replace("  dependencies: { cache: { prices } },\n", "")
      .replace("    await context.cache.prices.get({ sku: input.sku });\n", "")
      .replace(
        "handler: async (input, context) => {",
        'handler: async (input, context) => {\n    context.log.info("creating order", { password: input.sku });',
      ),
  );
  await rm(join(root, "src/orders/cache/prices.cache.ts"));
}

async function copyFullProject(): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".relkit-product-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-full"), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await linkWorkspacePackages(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
