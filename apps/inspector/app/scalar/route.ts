/** Hosts the reference UI independently of the backend's optional Scalar integration. */
import { GET as backendGET } from "../%5Frelkit/backend/[...path]/route";

export const dynamic = "force-dynamic";

/** Loads one document and its identity through the authenticated, loopback-only backend proxy. */
export async function GET(request: Request): Promise<Response> {
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
  try {
    const response = await backendGET(request, {
      params: Promise.resolve({ path: ["_relkit", "v1", "openapi.json"] }),
    });
    const generation = response.headers.get("x-relkit-generation-id");
    if (!response.ok || !generation) throw new Error("Reference unavailable");
    const snapshot = JSON.stringify({ generation, content: await response.json() }).replaceAll(
      "<",
      "\\u003c",
    );
    return new Response(referenceHtml(snapshot), { headers });
  } catch {
    return new Response("API reference unavailable. Reload this page to try again.", {
      status: 503,
      headers,
    });
  }
}

/** Embeds escaped JSON so the UI and every local request share the exact document generation.
 * @param snapshot - JSON with HTML opening delimiters escaped. @returns The standalone reference page. */
function referenceHtml(snapshot: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RELKIT API Reference</title>
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      async function loadReference() {
        const { generation, content } = ${snapshot};
        Scalar.createApiReference("#app", {
          content,
          onBeforeRequest: ({ request, requestBuilder }) => {
            const url = new URL(request.url, location.origin);
            const headers = (requestBuilder ?? request).headers;
            headers.delete("x-relkit-generation-id");
            if (url.origin === location.origin && url.pathname.startsWith("/_relkit/backend/")) {
              headers.set("x-relkit-generation-id", generation);
            }
          },
        });
      }
      loadReference().catch(() => {
        document.getElementById("app").textContent = "API reference unavailable. Reload this page to try again.";
      });
    </script>
  </body>
</html>`;
}
