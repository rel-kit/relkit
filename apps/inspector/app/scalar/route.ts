/** Hosts the reference UI independently of the backend's optional Scalar integration. */
import { GET as backendGET } from "../%5Frelkit/backend/[...path]/route";
import { INSPECTOR_BACKEND_PATH, OPENAPI_PATH } from "../../lib/backend-proxy-paths";

export const dynamic = "force-dynamic";

/** Loads one document and its identity through the authenticated, loopback-only backend proxy. */
export async function GET(request: Request): Promise<Response> {
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
  try {
    const response = await backendGET(request, {
      params: Promise.resolve({ path: OPENAPI_PATH.split("/") }),
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

/** Embeds escaped JSON; each local request first adopts the app's current generation, and a
 * changed document is shown once that request's response has arrived.
 * @param snapshot - JSON with HTML opening delimiters escaped. @returns The standalone reference page. */
function referenceHtml(snapshot: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RelKit API Reference</title>
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      async function loadReference() {
        let { generation, content } = ${snapshot};
        const configuration = () => ({ content, onBeforeRequest, onResponseReceived });
        const reference = Scalar.createApiReference("#app", configuration());
        const documentUrl = "${INSPECTOR_BACKEND_PATH}/${OPENAPI_PATH}";
        let checking;
        let documentChanged = false;
        // The app reloads on every save; adopt its current generation so sends never go stale.
        // Concurrent sends share one check.
        function refresh() {
          checking ??= adoptCurrentGeneration().finally(() => {
            checking = undefined;
          });
          return checking;
        }
        // HEAD reads the generation without transferring the document; it is fetched only on change.
        async function adoptCurrentGeneration() {
          // A stalled check must not hold the send; it then goes with the known generation.
          const probe = await fetch(documentUrl, {
            method: "HEAD",
            cache: "no-store",
            signal: AbortSignal.timeout(2000),
          });
          const current = probe.headers.get("x-relkit-generation-id");
          if (!probe.ok || !current || current === generation) return;
          const response = await fetch(documentUrl, {
            cache: "no-store",
            signal: AbortSignal.timeout(2000),
          });
          const next = response.headers.get("x-relkit-generation-id");
          if (!response.ok || !next) return;
          content = await response.json();
          generation = next;
          documentChanged = true;
        }
        // Swapping the document re-renders the client, so it waits until the current send has its response.
        function onResponseReceived() {
          if (!documentChanged) return;
          documentChanged = false;
          setTimeout(() => reference?.updateConfiguration?.(configuration()), 0);
        }
        async function onBeforeRequest({ request, requestBuilder }) {
          const url = new URL(request.url, location.origin);
          const headers = (requestBuilder ?? request).headers;
          headers.delete("x-relkit-generation-id");
          if (url.origin !== location.origin || !url.pathname.startsWith("${INSPECTOR_BACKEND_PATH}/")) return;
          await refresh().catch(() => {});
          headers.set("x-relkit-generation-id", generation);
        }
      }
      loadReference().catch(() => {
        document.getElementById("app").textContent = "API reference unavailable. Reload this page to try again.";
      });
    </script>
  </body>
</html>`;
}
