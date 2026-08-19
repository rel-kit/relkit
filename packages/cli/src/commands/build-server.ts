import { canonicalJson, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
import { SERVER_SHUTDOWN_SOURCE } from "./build-server-shutdown.js";

/** Emits the one Bun entrypoint used by dev, start, and the production container. */
export function serverSource(graph: ApplicationGraph, graphHash: string): string {
  return `import { createGeneratedAgentFunction, invokeAgent } from "@zsys/agents";
import { resolveEnv } from "@zsys/config";
import { getAwsProviderFactory } from "@zsys/cloud-aws/runtime";
import { createFunctionRegistry, createProviderRegistry, invoke, materializeEvents, materializeJobs } from "@zsys/engine";
import { createRegistrationPlan } from "@zsys/graph";
import { installInspectorEndpoints } from "@zsys/inspector-api";
import { createObservabilityRuntime } from "@zsys/observability";
import { consoleHumanSink, formatHumanLog } from "@zsys/runtime-effect";
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
const sourceValues = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
const shutdownController = new AbortController();
const telemetry = await createObservabilityRuntime({ root: process.env.ZSYS_OBSERVABILITY_ROOT ?? ".zsys/observability" });
globalThis["__zsys_flush_telemetry"] = telemetry.flush;
const executableManifest = { ...runtimeManifest, functions: { ...runtimeManifest.functions } };
const application = runtimeManifest.application;
if (application === undefined) throw new Error("Runtime application metadata is unavailable.");
const environmentResolution = resolveRuntimeEnvironment(application.env, environment, sourceValues);
const values = environmentResolution.values;
bindAgents();
const registry = createFunctionRegistry(graph, executableManifest);
const awsFactory = getAwsProviderFactory("aws");
let materializedJobs;
let jobWorker;
const providerStartup = (environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, environment, providers: application.providers, graph, values, environmentMetadata: application.env.metadata, signal: shutdownController.signal, ...(awsFactory === undefined ? {} : { factories: { aws: awsFactory } }) })
  : Promise.reject(environmentResolution.error)).then(async (value) => {
  await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  materializedJobs = await materializeJobs({ plan, engine: { invoke: invokeHttp }, createQueue: (context) => queueProvider(value, context) });
  jobWorker = startJobWorker(materializedJobs);
  await waitForProviderReady();
  providerReady = true;
  providers = value;
  return value;
}).catch((error) => {
  recordRuntimeFailure("runtime.provider", "Provider startup failed", error, "direct");
  providerFailed = true;
  return undefined;
});
let providers;
let providerReady = false;
let providerFailed = false;
const activeInvocations = new Set();
let stopping = false;
const internalEndpointsEnabled = environment !== "production" || process.env.ZSYS_INTERNAL_ENDPOINTS === "1";
const app = createApp({
  plan,
  manifest: executableManifest,
  engine: { invoke: invokeHttp },
  observability: telemetry,
  middleware: { generationId, observability: telemetry },
  internalEndpoints: {
    mode: environment,
    enabled: internalEndpointsEnabled,
    graph: {
      generationId,
      graphHash,
      manifestGraphHash: runtimeManifest.graphHash,
      graphContractVersion: ${GRAPH_VERSION},
      manifestContractVersion: ${MANIFEST_VERSION},
      manifestGeneratorVersion: ${GENERATOR_VERSION},
      graph,
    },
    ...(process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN }),
    readiness: () => ({
      ready: providerReady && !stopping,
      ...(stopping ? { reason: "stopping" } : providerFailed ? { reason: "unavailable" } : {}),
    }),
  },
});
installInspectorEndpoints(app, {
  mode: environment,
  enabled: internalEndpointsEnabled,
  ...(process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN === undefined
    ? {}
    : { bearerToken: process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN }),
  activeGeneration: {
    generationId,
    graphHash,
    graph,
    diagnostics: [],
    actions: {
      functions: {
        exists: (functionId) => registry.has(functionId),
        invoke: (request) => invokeHttp({ functionId: request.functionId, input: request.input, source: "direct", ...(request.signal === undefined ? {} : { signal: request.signal }) }),
      },
    },
  },
  query: telemetry.query,
  stream: telemetry.stream,
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
    source: request.source ?? "http",
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
    ...(request.parent === undefined ? {} : { parent: request.parent }),
    ...(request.inputSchema === undefined ? {} : { inputSchema: request.inputSchema }),
    ...(request.outputSchema === undefined ? {} : { outputSchema: request.outputSchema }),
    ...(request.errors === undefined ? {} : { errors: request.errors }),
    hooks: { observability: telemetry, context: invocationContext },
  });
  activeInvocations.add(task);
  try {
    return await task;
  } finally {
    activeInvocations.delete(task);
  }
}

function invocationContext({ invocation, signal, env, time }) {
  const write = (level, message, fields = {}) => {
    const record = telemetry.collect({ version: 1, signal: "log", timestamp: time.now().toISOString(), level, component: invocation.functionId, message, fields, functionId: invocation.functionId, invocationId: invocation.id, traceId: invocation.traceId });
    if (record?.signal === "log") consoleHumanSink.write(formatHumanLog(record), record);
  };
  const logger = (level) => (message, fields) => write(level, message, fields);
  return { invocation, signal, env, time, log: Object.freeze({ trace: logger("trace"), debug: logger("debug"), info: logger("info"), warn: logger("warn"), error: logger("error") }) };
}

${SERVER_RUNTIME_SOURCE}
${SERVER_SHUTDOWN_SOURCE}
`;
}
