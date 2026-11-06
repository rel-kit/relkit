/**
 * Emits HTTP admission and health policy from the checked server configuration.
 * Both verified generation forms await selected HTTP initialization through the
 * existing host before listener acquisition. Legacy inspection stays separately
 * scoped and cannot turn public application transports into inspection routes.
 */
import { serverHttpOptionsSource } from "./build-server-http-options.js";
import { preparedInspectorSource } from "./build-server-deferred-inspector.js";
import { serverJobsAdministrationSource } from "./build-server-jobs-administration.js";

import type { ServerSourceConfiguration } from "./build-server.types.js";
export type { ServerSourceConfiguration } from "./build-server.types.js";

/**
 * Behind a TLS-terminating proxy the server sees \`http://\` URLs, so the same-origin check would
 * deny every browser mutation. With \`RELKIT_TRUST_PROXY=1\` (set by images meant to run behind a
 * platform proxy) the request URL takes its scheme from \`X-Forwarded-Proto\`.
 */
const FORWARDED_REQUEST_SOURCE = `const trustProxy = process.env.RELKIT_TRUST_PROXY === "1";
function forwardedRequest(request) {
  if (!trustProxy) return request;
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (scheme !== "https" && scheme !== "http") return request;
  const url = new URL(request.url);
  if (url.protocol === scheme + ":") return request;
  url.protocol = scheme + ":";
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
  return new Request(url, { method: request.method, headers: request.headers, body, signal: request.signal, ...(body === undefined || body === null ? {} : { duplex: "half" }) });
}
`;

/**
 * Emits HTTP transport callbacks while the typed lifecycle host owns readiness and work.
 * @param configuration - Validated HTTP configuration.
 * @returns Source with the existing health, status, admission, and client contracts.
 */
export function serverHttpSource(configuration: ServerSourceConfiguration): string {
  const applicationSource = `let preparedApplication;
let app;
let server;
if (relkitMode.embedded !== true) {
preparedApplication = await runtimeOwner.resource("http.application", async () => createPreparedApp(httpApplicationOptions, ${preparedInspectorSource(configuration)}), (value) => value.close());
app = preparedApplication.app;
${serverJobsAdministrationSource(configuration)}
}
`;
  const dispatchSource =
    "runWithRelkit(await relkitHandle(), () => preparedApplication.fetch(request, bindings))";
  return `const internalEndpointsEnabled = environment !== "production";
const httpMiddlewareOptions = {
  generationId, graphHash, observability: telemetry, spanRuntime, maxBodyBytes: ${configuration.maxBodyBytes},
  ...(environment === "production" || process.env.RELKIT_DEV_LOGS !== "1" ? {} : { onLifecycleEvent(event) {
    if (event.type === "request.started") return;
    const level = event.status >= 500 ? "error" : event.status >= 400 ? "warn" : event.type === "request.cancelled" ? "debug" : "info";
    writeRuntimeLog(telemetry.collect({ version: 2, signal: "log", timestamp: event.completedAt,
      level, component: "runtime.http", message: event.type,
      requestId: event.requestId, originRequestId: event.requestId, traceId: event.traceId, generationId, graphHash,
      fields: { method: event.method, path: event.path, status: event.status, durationMs: event.durationMs } }));
  } }),
};
${serverHttpOptionsSource(configuration)}${applicationSource}${FORWARDED_REQUEST_SOURCE}
if (relkitMode.embedded === true) return { handle: await relkitHandle(), close: closeEmbedded };
const onStart = application.server?.onStart;
if (typeof onStart === "function") await runWithRelkit(await relkitHandle(), () => onStart());
// A function host (the Vercel function entry) takes this handler instead of a listener.
const relkitFetch = (request, bindings) => instrumentHttpRequest(forwardedRequest(request), httpMiddlewareOptions, async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/_relkit/v1/health/live") return healthResponse("ok");
    const ready = runtimeState().ready.provider && runtimeState().ready.nativeWorker && runtimeState().ready.database && runtimeState().ready.auth && !runtimeState().stopping;
    if (path === "/_relkit/v1/health/ready") return healthResponse(ready ? "ready" : "not-ready", ready ? 200 : 503);
    // Public platform probe: live while the process answers, 200 only once every provider is ready.
    if (path === "/healthz") return Response.json({ status: ready ? "ready" : "not-ready", live: true, ready }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
    if (runtimeState().stopping) return problemResponse(503, "Service Unavailable", "draining", "The server is shutting down.");
    const nativeWorker = nativeJobHandler(request);
    if (nativeWorker !== undefined) return await nativeWorker;
    if (!runtimeState().ready.provider || !runtimeState().ready.nativeWorker || !runtimeState().ready.database || !runtimeState().ready.auth)
      return problemResponse(503, "Service Unavailable", "not-ready", "The server is not ready yet.");
    try {
      return await ${dispatchSource};
    } catch {
      return problemResponse(500, "Internal Server Error", "internal-error", "The request failed unexpectedly.");
    }
  });
if (relkitMode.functionHost !== true)
  server = await relkitRuntime.serve({ hostname: "0.0.0.0", port: Number(process.env.PORT ?? 3000), fetch: relkitFetch });
runtimeOwner.setReady("server", true);`;
}
