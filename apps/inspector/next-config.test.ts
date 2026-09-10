import { afterEach, expect, test } from "bun:test";
import { GET, POST } from "./app/%5Frelkit/backend/[...path]/route";
import nextConfig from "./next.config";

const previousBackendUrl = process.env.RELKIT_BACKEND_URL;
let backend: ReturnType<typeof Bun.serve> | undefined;

test("builds a standalone inspector distribution", () => {
  expect(nextConfig.output).toBe("standalone");
});

test("proxies browser backend requests using runtime configuration", async () => {
  backend = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      return Response.json({
        method: request.method,
        path: url.pathname,
        search: url.search,
        body: await request.text(),
      });
    },
  });
  process.env.RELKIT_BACKEND_URL = `http://127.0.0.1:${backend.port}`;
  const response = await POST(
    new Request("http://inspector.local/_relkit/backend/_relkit/v1/actions?dryRun=true", {
      method: "POST",
      headers: { origin: "http://inspector.local" },
      body: "payload",
    }),
    { params: Promise.resolve({ path: ["_relkit", "v1", "actions"] }) },
  );

  expect(await response.json()).toEqual({
    method: "POST",
    path: "/_relkit/v1/actions",
    search: "?dryRun=true",
    body: "payload",
  });
});

test("adds the inspector proxy base to proxied OpenAPI documents", async () => {
  backend = Bun.serve({
    port: 0,
    fetch: () => Response.json({ openapi: "3.1.0", paths: {} }),
  });
  process.env.RELKIT_BACKEND_URL = `http://127.0.0.1:${backend.port}`;
  const response = await GET(
    new Request("http://inspector.local/_relkit/backend/_relkit/v1/openapi.json"),
    { params: Promise.resolve({ path: ["_relkit", "v1", "openapi.json"] }) },
  );

  expect(await response.json()).toMatchObject({
    servers: [{ url: "/_relkit/backend" }],
  });
});

test("forwards the browser abort signal to the upstream request", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded: AbortSignal | null | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    forwarded = init?.signal;
    return Promise.resolve(Response.json({ ok: true }));
  }) as typeof fetch;
  process.env.RELKIT_BACKEND_URL = "http://127.0.0.1:3212";
  const controller = new AbortController();
  try {
    await GET(
      new Request("http://inspector.local/_relkit/backend/rpc/relkit.agent.observe", {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ path: ["rpc", "relkit.agent.observe"] }) },
    );
    expect(forwarded).toBe(controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

afterEach(async () => {
  await backend?.stop(true);
  backend = undefined;
  if (previousBackendUrl === undefined) delete process.env.RELKIT_BACKEND_URL;
  else process.env.RELKIT_BACKEND_URL = previousBackendUrl;
});
