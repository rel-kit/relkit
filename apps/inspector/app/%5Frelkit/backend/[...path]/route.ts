const requestHeadersToDrop = ["connection", "content-length", "host"];
const responseHeadersToDrop = ["connection", "content-encoding", "content-length"];
const OPENAPI_PATH = "_relkit/v1/openapi.json";
const INSPECTOR_BACKEND_PATH = "/_relkit/backend";

type RouteContext = { readonly params: Promise<{ readonly path: readonly string[] }> };

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const backend = process.env.RELKIT_BACKEND_URL?.replace(/\/$/, "");
  if (backend === undefined)
    return Response.json({ error: "RELKIT inspector backend is not configured." }, { status: 503 });
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`${backend}/${path.map(encodeURIComponent).join("/")}`);
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of requestHeadersToDrop) headers.delete(name);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });
  const responseHeaders = new Headers(response.headers);
  for (const name of responseHeadersToDrop) responseHeaders.delete(name);
  const body =
    response.ok && path.join("/") === OPENAPI_PATH ? await addProxyServer(response) : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function addProxyServer(response: Response): Promise<BodyInit | null> {
  try {
    const document = await response.clone().json();
    if (!isRecord(document) || document.servers !== undefined) return response.body;
    return JSON.stringify({ ...document, servers: [{ url: INSPECTOR_BACKEND_PATH }] });
  } catch {
    return response.body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
