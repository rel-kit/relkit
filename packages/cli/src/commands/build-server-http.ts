/**
 * Emits HTTP admission and health policy from the checked server configuration.
 * Prepared capsules own their deferred transport facade through the existing host;
 * production keeps the canonical synchronous app and both paths use its REST app
 * for inspector registration before listener acquisition.
 */
import { serverHttpOptionsSource } from "./build-server-http-options.js";
import { inspectorEndpointsSource } from "./build-server-http-inspector.js";
import { preparedInspectorSource } from "./build-server-deferred-inspector.js";

import type { ServerSourceConfiguration } from "./build-server.types.js";
export type { ServerSourceConfiguration } from "./build-server.types.js";

/**
 * Emits HTTP transport callbacks while the typed lifecycle host owns readiness and work.
 * @param configuration - Validated HTTP configuration.
 * @returns Source with the existing health, status, admission, and client contracts.
 */
export function serverHttpSource(configuration: ServerSourceConfiguration): string {
  let applicationSource = "const app = createApp(httpApplicationOptions);";
  let dispatchSource = "app.fetch(request, bunServer)";
  let inspectorSource = inspectorEndpointsSource(configuration);
  if (configuration.httpApplication === "prepared") {
    applicationSource = `const preparedApplication = await runtimeOwner.resource("http.application", async () => createPreparedApp(httpApplicationOptions, ${preparedInspectorSource(configuration)}), (value) => value.close());
const app = preparedApplication.app;
`;
    dispatchSource = "preparedApplication.fetch(request, bunServer)";
    inspectorSource = "";
  }
  return `const internalEndpointsEnabled = environment !== "production" || process.env.RELKIT_INTERNAL_ENDPOINTS === "1";
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
${inspectorSource}
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  websocket: honoWebSocket,
  fetch: (request, bunServer) => instrumentHttpRequest(request, httpMiddlewareOptions, async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/_relkit/v1/health/live") return healthResponse("ok");
    if (path === "/_relkit/v1/health/ready")
      return healthResponse(runtimeState().ready.provider && runtimeState().ready.nativeWorker && runtimeState().ready.database && runtimeState().ready.auth && !runtimeState().stopping ? "ready" : "not-ready", runtimeState().ready.provider && runtimeState().ready.nativeWorker && runtimeState().ready.database && runtimeState().ready.auth && !runtimeState().stopping ? 200 : 503);
    if (runtimeState().stopping) return Response.json({ error: "draining" }, { status: 503 });
    const nativeWorker = nativeJobHandler(request);
    if (nativeWorker !== undefined) return await nativeWorker;
    if (!runtimeState().ready.provider || !runtimeState().ready.nativeWorker || !runtimeState().ready.database || !runtimeState().ready.auth)
      return Response.json({ error: "not-ready" }, { status: 503 });
    try {
      return await ${dispatchSource};
    } catch {
      return Response.json({ error: "internal-error" }, { status: 500 });
    }
  }),
});
runtimeOwner.setReady("server", true);`;
}
