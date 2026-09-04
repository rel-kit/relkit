import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "./src/commands/build.js";
import { startProject } from "./src/commands/start.js";
import { linkWorkspacePackages } from "./test-workspace.js";

const roots: string[] = [];

test("the emitted full-graph server runs agents and correlated observability", async () => {
  const root = await copyFullProject();
  const modelServer = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        id: "resp-local",
        created_at: Math.floor(Date.now() / 1_000),
        model: "gpt-5-mini",
        output: [
          {
            type: "message",
            role: "assistant",
            id: "msg-local",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ answer: "local answer" }),
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 0,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 0,
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }),
  });
  await configureProductFixture(root, `http://127.0.0.1:${modelServer.port}/v1`);
  const built = await buildProject({ projectRoot: root });
  expect(built.ok).toBe(true);
  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 3_000,
    environment: { OPENAI_API_KEY: "local-test-key" },
    spawn: (command, options) => Bun.spawn(command, { ...options, stderr: "inherit" }),
  });
  const base = `http://${started.hostname}:${started.port}`;
  const streamController = new AbortController();
  const streamResponse = fetch(`${base}/_relkit/v1/stream`, { signal: streamController.signal });
  try {
    const route = await fetch(`${base}/orders/order-1`, {
      headers: { authorization: "allowed" },
    });
    expect(route.status).toBe(200);
    const requestId = route.headers.get("x-request-id");
    expect(requestId).toBeTruthy();

    const created = await invoke(base, built.graphHash, "orders.create", {
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
    streamController.abort();

    const agent = await invoke(base, built.graphHash, "relkit.agent.orders.support-agent.invoke", {
      question: "Where is order-1?",
    });
    const agentBody = await agent.json();
    if (agent.status !== 200) throw new Error(JSON.stringify(agentBody));
    expect(agentBody).toMatchObject({ output: { answer: "local answer" } });

    const detail = await fetch(`${base}/_relkit/v1/requests/${requestId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      request: {
        requestId,
        functionId: "orders.get",
      },
      spans: expect.arrayContaining([
        expect.objectContaining({ functionId: "orders.get", status: "completed" }),
      ]),
    });

    await invoke(base, built.graphHash, "orders.create", {
      orderId: "order-2",
      sku: "second-secret",
    });
    const logs = await page(base, "/logs?functionId=orders.create&limit=1");
    expect(logs.items[0]).toMatchObject({ fields: {} });
    expect(JSON.stringify(logs)).not.toContain("pre-sink-secret");
    expect(logs.nextCursor).toBeDefined();
    const continued = await page(
      base,
      `/logs?functionId=orders.create&limit=1&cursor=${logs.nextCursor}`,
    );
    expect(continued.items).toHaveLength(1);

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
  } finally {
    streamController.abort();
    await started.stop();
    await started.exited;
    modelServer.stop(true);
  }
});

async function invoke(base: string, graphHash: string, functionId: string, input: unknown) {
  return fetch(`${base}/_relkit/v1/actions/functions/${functionId}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ generationId: "generation.runtime", graphHash, input }),
  });
}

async function page(base: string, path: string) {
  return (await (await fetch(`${base}/_relkit/v1${path}`)).json()) as {
    items: unknown[];
    nextCursor?: string;
  };
}

async function readChunk(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const timeout = Bun.sleep(2_000).then<never>(() => {
    throw new Error("SSE timeout");
  });
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("event:")) {
    const result = await Promise.race([reader.read(), timeout]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}

async function eventually(check: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await check()) return true;
    await Bun.sleep(50);
  }
  return false;
}

async function configureProductFixture(root: string, modelBaseUrl: string): Promise<void> {
  const appPath = join(root, "relkit.config.ts");
  const app = await readFile(appPath, "utf8");
  await writeFile(
    appPath,
    app.replace(
      'apiKey: envFactory.secret("MODEL_API_KEY"),',
      `apiKey: envFactory.secret("OPENAI_API_KEY"),\n      baseURL: "${modelBaseUrl}",`,
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
