import { canonicalJson, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";

/** Emits the one Bun entrypoint used by dev, start, and the production container. */
export function serverSource(graph: ApplicationGraph, graphHash: string): string {
  return `import { getAwsProviderFactory } from "@zsys/cloud-aws/runtime";
import { createFunctionRegistry, createInspectableObservabilityHooks, createProviderRegistry, invoke } from "@zsys/engine";
import { createRegistrationPlan } from "@zsys/graph";
import { createObservabilityCollector } from "@zsys/observability";
import { createApp } from "@zsys/runtime-hono";
import { runtimeManifest } from "./runtime.manifest.ts";

const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const plan = createRegistrationPlan(graph);
if (plan.graphHash !== graphHash) throw new Error("Runtime graph hash verification failed.");
const environment = resolveEnvironment(process.env.ZSYS_ENV, process.env.NODE_ENV);
const generationId = process.env.ZSYS_GENERATION_ID ?? "generation.runtime";
const sourceToken = tokenFrom(process.env.ZSYS_SOURCE_TOKEN);
const generationToken = tokenFrom(process.env.ZSYS_GENERATION_TOKEN);
const values = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
const shutdownController = new AbortController();
const registry = createFunctionRegistry(graph, runtimeManifest);
const application = runtimeManifest.application;
if (application === undefined) throw new Error("Runtime application metadata is unavailable.");
const awsFactory = getAwsProviderFactory("aws");
const providerStartup = createProviderRegistry({ generationId, environment, providers: application.providers, graph, values, signal: shutdownController.signal, ...(awsFactory === undefined ? {} : { factories: { aws: awsFactory } }) }).then(async (value) => {
  await waitForProviderReady();
  providerReady = true;
  providers = value;
  return value;
}).catch(() => {
  providerFailed = true;
  return undefined;
});
let providers;
let providerReady = false;
let providerFailed = false;
const runtimeRecords = createInspectableObservabilityHooks();
const requestRecords = createObservabilityCollector();
const requestSink = { collect: (record) => requestRecords.collect(record), read: requestRecords.read, readRecords: requestRecords.read };
const activeInvocations = new Set();
let stopping = false;
const internalEndpointsEnabled = environment !== "production" || process.env.ZSYS_INTERNAL_ENDPOINTS === "1";
const app = createApp({
  plan,
  manifest: runtimeManifest,
  engine: { invoke: invokeHttp },
  observability: requestSink,
  middleware: { generationId, observability: requestSink },
  internalEndpoints: {
    mode: environment,
    enabled: internalEndpointsEnabled,
    ...(process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN }),
    readiness: () => ({
      ready: providerReady && !stopping,
      ...(stopping ? { reason: "stopping" } : providerFailed ? { reason: "unavailable" } : {}),
    }),
    requests: () => ({ items: requestRecords.read() }),
    logs: () => ({ items: runtimeRecords.readRecords().filter((record) => record.signal === "log") }),
    traces: () => ({ items: runtimeRecords.readRecords().filter((record) => record.signal === "trace" || record.signal === "span") }),
  },
});
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/_zsys/v1/health/live") return healthResponse("ok");
    if (path === "/_zsys/v1/health/ready")
      return healthResponse(providerReady && !stopping ? "ready" : "not-ready", providerReady && !stopping ? 200 : 503);
    if (stopping) return Response.json({ error: "draining" }, { status: 503 });
    try {
      return await app.fetch(request);
    } catch {
      return Response.json({ error: "internal-error" }, { status: 500 });
    }
  },
});

async function invokeHttp(request) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const target = targetFor(request.functionId);
  const task = invoke({
    input: request.input,
    source: "http",
    registry,
    functionId: request.functionId,
    ...(target === undefined ? {} : { target }),
    ...(request.signal === undefined
      ? { signal: shutdownController.signal }
      : { signal: AbortSignal.any([request.signal, shutdownController.signal]) }),
    ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
    ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    clients: createDependencySources(providerRegistry),
    hooks: { observability: runtimeRecords },
  });
  activeInvocations.add(task);
  try {
    return await task;
  } finally {
    activeInvocations.delete(task);
  }
}

function targetFor(functionId) {
  const target = runtimeManifest.targets?.[functionId];
  return target !== null && typeof target === "object" && typeof target.handler === "function"
    ? target
    : undefined;
}

function createDependencySources(providerRegistry) {
  return {
    functions: Object.fromEntries(plan.functions.map((node) => [node.id, registry.get(node.id)])),
    agents: Object.fromEntries(
      plan.agents.map((node) => [\`zsys.agent.\${node.id}.invoke\`, registry.get(\`zsys.agent.\${node.id}.invoke\`)]),
    ),
    buckets: Object.fromEntries(plan.buckets.map((node) => [node.id, provider(providerRegistry, "buckets", node.profile)])),
    cache: Object.fromEntries(plan.caches.map((node) => [node.id, provider(providerRegistry, "cache", node.profile)])),
    jobs: Object.fromEntries(plan.queues.filter((node) => node.kind === "job").map((node) => [node.id, provider(providerRegistry, "jobs", node.profile)])),
    events: Object.fromEntries((plan.events ?? []).map((node) => [node.id, provider(providerRegistry, "events", "default")])),
  };
}

function provider(providerRegistry, capability, profile) {
  return providerRegistry.get(capability, profile)?.value;
}

function healthResponse(status, code = 200) {
  return Response.json({ protocol: "zsys.inspector", version: 1, status, graphHash, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, environmentReady: true, providerReady: providerReady && !stopping, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }, { status: code, headers: { "x-zsys-api-version": "1" } });
}

function tokenFrom(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function resolveEnvironment(value, nodeEnvironment) {
  if (value === "development" || value === "test" || value === "production") return value;
  return nodeEnvironment === "production" ? "production" : "development";
}

function waitForProviderReady() {
  const milliseconds = timeoutFrom(process.env.ZSYS_PROVIDER_READY_DELAY_MS, 0);
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, milliseconds); shutdownController.signal.addEventListener("abort", () => { clearTimeout(timer); reject(shutdownController.signal.reason ?? new Error("Provider startup was aborted.")); }, { once: true }); });
}

function timeoutFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 30_000) : fallback;
}

function bounded(task, milliseconds) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; resolve(false); }, milliseconds);
    Promise.resolve(task).then(() => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
    }, () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
    });
  });
}

function flushTelemetry() {
  const flush = globalThis["__zsys_flush_telemetry"];
  return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve();
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  shutdownController.abort(new Error("Runtime is stopping."));
  const drainTimeoutMs = timeoutFrom(process.env.ZSYS_DRAIN_TIMEOUT_MS, 10_000);
  const telemetryTimeoutMs = timeoutFrom(process.env.ZSYS_TELEMETRY_FLUSH_TIMEOUT_MS, 1_000);
  await bounded(Promise.allSettled(activeInvocations), drainTimeoutMs);
  await bounded(flushTelemetry(), telemetryTimeoutMs);
  await bounded(providerStartup, drainTimeoutMs);
  if (providers !== undefined) await providers.dispose().catch(() => undefined);
  await server.stop(true);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
`;
}
