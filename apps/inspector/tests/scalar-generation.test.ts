/** Executes the served bootstrap against a native proxy fixture without loading a CDN. */
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

test("pins the embedded document without browser fetches or foreign identity leaks", async () => {
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
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Missing Scalar bootstrap");
  let before:
    ((input: { request: Request; requestBuilder?: { headers: Headers } }) => void) | undefined;
  await runInNewContext(script, {
    URL,
    location: { origin: "http://inspector" },
    Scalar: {
      createApiReference: (
        _selector: string,
        config: { content: unknown; onBeforeRequest: typeof before },
      ) => {
        expect(config.content).toEqual({
          openapi: "3.1.0",
          info: { title },
          servers: [{ url: "/_relkit/backend" }],
        });
        before = config.onBeforeRequest;
      },
    },
  });
  if (!before) throw new Error("Missing generation hook");
  checkHeaders(before);
  expect(calls).toBe(1);
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

/** Checks both Scalar hook variants and rejects stale caller-supplied identities on foreign URLs. */
function checkHeaders(
  before: (input: { request: Request; requestBuilder?: { headers: Headers } }) => void,
): void {
  for (const url of [
    "http://inspector/_relkit/backend/todos",
    "http://foreign/todos",
    "http://inspector/other",
  ]) {
    const request = new Request(url, { headers: { "x-relkit-generation-id": "previous-request" } });
    const headers = new Headers(request.headers);
    before({ request, requestBuilder: { headers } });
    before({ request });
    const expected = url.includes("/_relkit/backend/") ? "one" : null;
    expect(headers.get("x-relkit-generation-id")).toBe(expected);
    expect(request.headers.get("x-relkit-generation-id")).toBe(expected);
  }
}
