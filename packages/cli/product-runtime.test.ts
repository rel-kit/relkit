import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "./src/commands/build.js";
import { startProject } from "./src/commands/start.js";

const roots: string[] = [];

test("the emitted full-graph server runs jobs, agents, and correlated observability", async () => {
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
  const streamResponse = fetch(`${base}/_zsys/v1/stream`, { signal: streamController.signal });
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

    const agent = await invoke(base, built.graphHash, "zsys.agent.orders.support-agent.invoke", {
      question: "Where is order-1?",
    });
    const agentBody = await agent.json();
    if (agent.status !== 200) throw new Error(JSON.stringify(agentBody));
    expect(agentBody).toMatchObject({ output: { answer: "local answer" } });

    const detail = await fetch(`${base}/_zsys/v1/requests/${requestId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      request: {
        requestId,
        functionId: "orders.get",
        timeline: expect.arrayContaining([expect.objectContaining({ kind: "function" })]),
      },
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
        const traces = await page(base, "/traces?functionId=receipts.send&limit=20");
        return traces.items.length > 0;
      }),
    ).resolves.toBe(true);
  } finally {
    streamController.abort();
    await started.stop();
    await started.exited;
    modelServer.stop(true);
  }
});

async function invoke(base: string, graphHash: string, functionId: string, input: unknown) {
  return fetch(`${base}/_zsys/v1/actions/functions/${functionId}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ generationId: "generation.runtime", graphHash, input }),
  });
}

async function page(base: string, path: string) {
  return (await (await fetch(`${base}/_zsys/v1${path}`)).json()) as {
    items: unknown[];
    nextCursor?: string;
  };
}

async function readChunk(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 2_000)),
  ]);
  return new TextDecoder().decode(result.value);
}

async function eventually(check: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await check()) return true;
    await Bun.sleep(50);
  }
  return false;
}

async function configureProductFixture(root: string, modelBaseUrl: string): Promise<void> {
  const appPath = join(root, "zsys.config.ts");
  const app = await readFile(appPath, "utf8");
  await writeFile(
    appPath,
    app
      .replace(
        "const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });",
        "const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000), OPENAI_API_KEY: envFactory.secret() });",
      )
      .replace(
        "openai: { apiKey: env.MODEL_API_KEY },",
        `openai: { apiKey: env.MODEL_API_KEY, baseURL: "${modelBaseUrl}" },`,
      ),
  );
  const functionPath = join(root, "src/functions/create-order.function.ts");
  const source = await readFile(functionPath, "utf8");
  await writeFile(
    functionPath,
    source.replace(
      "handler: async (input, context) => {",
      'handler: async (input, context) => {\n    context.log.info("creating order", { password: input.sku });',
    ),
  );
}

async function copyFullProject(): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".zsys-product-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-full"), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  const scope = join(root, "node_modules", "@zsys");
  await mkdir(scope, { recursive: true });
  for (const name of [
    "agents",
    "app",
    "buckets",
    "cache",
    "cloud-aws",
    "compiler",
    "config",
    "contracts",
    "diagnostics",
    "engine",
    "events",
    "functions",
    "graph",
    "inspector-api",
    "invocation",
    "jobs",
    "observability",
    "providers-local",
    "providers-standard",
    "routes",
    "runtime-effect",
    "runtime-hono",
    "schema",
    "services",
    "supervisor",
    "testing",
    "tools",
  ])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
