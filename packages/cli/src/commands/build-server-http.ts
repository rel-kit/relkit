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
${serverHttpOptionsSource(configuration)}${applicationSource}
if (relkitMode.embedded === true) return { handle: await relkitHandle(), close: closeEmbedded };
const onStart = application.server?.onStart;
if (typeof onStart === "function") await runWithRelkit(await relkitHandle(), () => onStart());
server = await relkitRuntime.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  fetch: (request, bindings) => instrumentHttpRequest(request, httpMiddlewareOptions, async (request) => {
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
  }),
});
runtimeOwner.setReady("server", true);`;
}
