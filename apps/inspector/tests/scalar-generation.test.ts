/** Executes the served bootstrap against a native proxy fixture with stub Scalar and browser fetch. */
import { afterEach, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { GET } from "../app/scalar/route";

const previousBackendUrl = process.env.RELKIT_BACKEND_URL;
let backend: ReturnType<typeof Bun.serve> | undefined;

afterEach(async () => {
  await backend?.stop(true);
  backend = undefined;
  if (previousBackendUrl === undefined) delete process.env.RELKIT_BACKEND_URL;
  else process.env.RELKIT_BACKEND_URL = previousBackendUrl;
});

test("embeds the document and stamps the current generation on local requests", async () => {
  let calls = 0;
  const title = "</script><script>throw new Error('injected')</script>";
  serve(() => {
    calls++;
    return Response.json(
      { openapi: "3.1.0", info: { title } },
      {
        headers: { "x-relkit-generation-id": "one" },
      },
    );
  });
  const response = await GET(new Request("http://inspector/scalar"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html).toContain('<link rel="icon" href="/logo.svg" type="image/svg+xml" />');
  expect(html).not.toContain(title);
  const page = await bootstrap(html, () =>
    Response.json({ title: "unchanged" }, { headers: { "x-relkit-generation-id": "one" } }),
  );
  expect(page.configurations[0]?.content).toEqual({
    openapi: "3.1.0",
    info: { title },
    servers: [{ url: "/_relkit/backend" }],
  });
  await checkHeaders(page.before, "one");
  expect(page.configurations).toHaveLength(1);
  expect(page.fetches).toEqual(Array(2).fill("HEAD /_relkit/backend/_relkit/v1/openapi.json"));
  expect(calls).toBe(1);
});

test("adopts the reloaded generation and document before sending", async () => {
  serve(() =>
    Response.json({ openapi: "3.1.0" }, { headers: { "x-relkit-generation-id": "one" } }),
  );
  const html = await (await GET(new Request("http://inspector/scalar"))).text();
  const reloaded = { openapi: "3.1.0", info: { title: "reloaded" } };
  const page = await bootstrap(html, () =>
    Response.json(reloaded, { headers: { "x-relkit-generation-id": "two" } }),
  );
  await checkHeaders(page.before, "two");
  // The document is swapped only after the send that noticed the reload has its response.
  expect(page.configurations).toHaveLength(1);
  page.after();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(page.configurations).toHaveLength(2);
  expect(page.configurations[1]?.content).toEqual(reloaded);
  page.after();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(page.configurations).toHaveLength(2);
  expect(page.fetches).toEqual([
    "HEAD /_relkit/backend/_relkit/v1/openapi.json",
    "GET /_relkit/backend/_relkit/v1/openapi.json",
    "HEAD /_relkit/backend/_relkit/v1/openapi.json",
  ]);
});

test("keeps the embedded generation when the current one cannot be read", async () => {
  serve(() =>
    Response.json({ openapi: "3.1.0" }, { headers: { "x-relkit-generation-id": "one" } }),
  );
  const html = await (await GET(new Request("http://inspector/scalar"))).text();
  const page = await bootstrap(html, () => {
    throw new TypeError("offline");
  });
  await checkHeaders(page.before, "one");
  expect(page.configurations).toHaveLength(1);
});

for (const response of [
  Response.json({}),
  Response.json({}, { status: 503 }),
  new Response("invalid JSON", { headers: { "x-relkit-generation-id": "one" } }),
]) {
  test(`fails closed for an unavailable or invalid document (${response.status})`, async () => {
    serve(() => response.clone());
    const result = await GET(new Request("http://inspector/scalar"));
    expect(result.status).toBe(503);
    const html = await result.text();
    expect(html).toContain("API reference unavailable");
    expect(html).not.toContain("Scalar.createApiReference");
  });
}

/** Runs only an ephemeral loopback upstream and checks the actual proxy path. */
function serve(response: () => Response): void {
  backend = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      expect(new URL(request.url).pathname).toBe("/_relkit/v1/openapi.json");
      return response();
    },
  });
  process.env.RELKIT_BACKEND_URL = `http://127.0.0.1:${backend.port}`;
}

type BeforeRequest = (input: {
  request: Request;
  requestBuilder?: { headers: Headers };
}) => Promise<void>;

/** Runs the served bootstrap with a stub Scalar and browser fetch. */
async function bootstrap(html: string, current: () => Response) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error("Missing Scalar bootstrap");
  const configurations: {
    content: unknown;
    onBeforeRequest: BeforeRequest;
    onResponseReceived: () => void;
  }[] = [];
  const fetches: string[] = [];
  await runInNewContext(script, {
    URL,
    AbortSignal,
    setTimeout,
    location: { origin: "http://inspector" },
    fetch: async (input: string, init?: RequestInit) => {
      fetches.push(`${init?.method ?? "GET"} ${input}`);
      return current();
    },
    Scalar: {
      createApiReference: (_selector: string, config: (typeof configurations)[number]) => {
        configurations.push(config);
        return { updateConfiguration: (next: typeof config) => configurations.push(next) };
      },
    },
  });
  const before = configurations[0]?.onBeforeRequest;
  const after = configurations[0]?.onResponseReceived;
  if (!before || !after) throw new Error("Missing generation hook");
  return { before, after, configurations, fetches };
}

/** Checks both Scalar hook variants and rejects stale caller-supplied identities on foreign URLs. */
async function checkHeaders(before: BeforeRequest, generation: string): Promise<void> {
  for (const url of [
    "http://inspector/_relkit/backend/todos",
    "http://foreign/todos",
    "http://inspector/other",
  ]) {
    const request = new Request(url, { headers: { "x-relkit-generation-id": "previous-request" } });
    const headers = new Headers(request.headers);
    await before({ request, requestBuilder: { headers } });
    await before({ request });
    const expected = url.includes("/_relkit/backend/") ? generation : null;
    expect(headers.get("x-relkit-generation-id")).toBe(expected);
    expect(request.headers.get("x-relkit-generation-id")).toBe(expected);
  }
}
