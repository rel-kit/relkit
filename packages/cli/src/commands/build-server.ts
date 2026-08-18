import { canonicalJson, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";

export function serverSource(graph: ApplicationGraph, graphHash: string): string {
  return `import { runtimeManifest } from "./runtime.manifest.ts";
const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const headers = { "content-type": "application/json", "cache-control": "no-store", "x-zsys-api-version": "1" };
const sourceToken = process.env.ZSYS_SOURCE_TOKEN === undefined ? undefined : Number(process.env.ZSYS_SOURCE_TOKEN);
const generationToken = process.env.ZSYS_GENERATION_TOKEN === undefined ? undefined : Number(process.env.ZSYS_GENERATION_TOKEN);
const maxShutdownTimeoutMs = 30_000;
const providerReadyDelayMs = timeoutFrom(process.env.ZSYS_PROVIDER_READY_DELAY_MS, 0);
let providerReady = providerReadyDelayMs === 0;
let ready = providerReady;
const providerReadyTimer = providerReady ? undefined : setTimeout(() => { providerReady = true; ready = true; }, providerReadyDelayMs);
let stopping;
const activeRequests = new Set();
let drainWaiter;
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers }); }
function health() { return { protocol: "zsys.inspector", version: 1, status: "ok", graphHash, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }; }
function timeoutFrom(value, fallback) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, maxShutdownTimeoutMs) : fallback; }
function waitForDrain() { return activeRequests.size === 0 ? Promise.resolve() : new Promise((resolve) => { drainWaiter = resolve; }); }
function requestDone(controller) { activeRequests.delete(controller); if (activeRequests.size === 0 && drainWaiter !== undefined) { drainWaiter(); drainWaiter = undefined; } }
function flushTelemetry() { const flush = (globalThis as Record<string, unknown>)["__zsys_flush_telemetry"]; return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve(); }
function bounded(task, milliseconds) { return new Promise((resolve) => { let settled = false; const timer = setTimeout(() => { settled = true; resolve(false); }, milliseconds); Promise.resolve(task).then(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } }, () => { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } }); }); }
function paramsFor(path, pathname) {
  const expected = path.split("/"), actual = pathname.split("/");
  if (expected.length !== actual.length) return;
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index], value = actual[index];
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return;
  }
  return params;
}
async function readBody(request) { const text = await request.text(); if (text === "") return; try { return JSON.parse(text); } catch { return text; } }
function valueAt(value, name) { return value && typeof value === "object" ? value[name] : undefined; }
function mapInput(mapping, url, params, request, body) {
  if (!mapping || typeof mapping !== "object") return;
  if (mapping.kind === "input" || mapping.kind === "nested") return Object.fromEntries(Object.entries(mapping.fields).map(([key, value]) => [key, mapInput(value, url, params, request, body)]));
  if (mapping.kind === "constant") return mapping.value;
  if (mapping.kind === "default") { const value = mapInput(mapping.value, url, params, request, body); return value === undefined ? mapping.default : value; }
  if (mapping.kind === "optional") return mapInput(mapping.value, url, params, request, body);
  if (mapping.kind === "query") return url.searchParams.get(mapping.name) ?? undefined;
  if (mapping.kind === "path") return params[mapping.name];
  if (mapping.kind === "header") return request.headers.get(mapping.name) ?? undefined;
  if (mapping.kind === "body") return mapping.name === undefined ? body : valueAt(body, mapping.name);
}
function context(signal) { const log = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }; return { invocation: { id: "zsys-production", traceId: "zsys-production", startedAt: new Date().toISOString(), attempt: 1, source: "http" }, signal, env: {}, log, time: { now: () => new Date(), sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }, functions: {}, jobs: {}, events: {}, buckets: {}, cache: {}, agents: {} }; }
async function route(request) {
  if (!ready) return json({ error: "Server is draining" }, 503);
  const url = new URL(request.url), node = graph.nodes.find((value) => value.kind === "trigger" && value.triggerType === "http" && value.config.method === request.method && paramsFor(value.config.path, url.pathname));
  if (!node) return;
  const controller = new AbortController();
  activeRequests.add(controller);
  try {
    const handler = runtimeManifest.functions[node.targetFunctionId];
    if (typeof handler !== "function") return json({ error: "Handler unavailable" }, 500);
    const value = await handler(mapInput(node.config.request, url, paramsFor(node.config.path, url.pathname), request, await readBody(request)), context(controller.signal));
    const success = node.config.responses.find((response) => response.kind === "success");
    return json(value, success?.status ?? 200);
  } finally {
    requestDone(controller);
  }
}
const server = Bun.serve({ port: Number(process.env.PORT ?? 3000), async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/_zsys/v1/health/live") return json(health());
  if (path === "/_zsys/v1/health/ready") return ready ? json({ ...health(), status: "ready", environmentReady: true, providerReady: true }) : json({ ...health(), status: "not-ready", environmentReady: true, providerReady: false }, 503);
  if (path === "/_zsys/v1/graph") return json({ protocol: "zsys.inspector", version: 1, ...graph, graphHash, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) });
  if (!ready) return json({ error: "Server is draining" }, 503);
  try { return (await route(request)) ?? new Response("Not found", { status: 404 }); } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 500); }
} });
async function shutdown() {
  if (stopping !== undefined) return stopping;
  ready = false;
  providerReady = false;
  if (providerReadyTimer !== undefined) clearTimeout(providerReadyTimer);
  const drainTimeoutMs = timeoutFrom(process.env.ZSYS_DRAIN_TIMEOUT_MS, 10_000);
  const telemetryTimeoutMs = timeoutFrom(process.env.ZSYS_TELEMETRY_FLUSH_TIMEOUT_MS, 1_000);
  stopping = (async () => {
    const drained = await bounded(waitForDrain(), drainTimeoutMs);
    if (!drained) for (const controller of activeRequests) controller.abort();
    await bounded(flushTelemetry(), telemetryTimeoutMs);
    await server.stop(true);
    process.exitCode = 0;
  })();
  await stopping;
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
void server;
`;
}
