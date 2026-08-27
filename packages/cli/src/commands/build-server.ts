import { canonicalJson, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { JsonValue } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import { SERVER_INVOCATION_SOURCE } from "./build-server-invocation.js";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
import { SERVER_SHUTDOWN_SOURCE } from "./build-server-shutdown.js";

/** Emits the one Bun entrypoint used by dev, start, and the production container. */
export function serverSource(
  graph: ApplicationGraph,
  graphHash: string,
  openapi: JsonValue = {},
  clientContract: JsonValue = {},
  configuration: {
    readonly maxBodyBytes: number;
    readonly apiDocs: { readonly enabledInProduction: boolean };
    readonly clientContract: boolean;
    readonly mcp: boolean;
    readonly maxPreviewBytes: number;
  } = {
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
    clientContract: true,
    mcp: true,
    maxPreviewBytes: 1_048_576,
  },
): string {
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createGeneratedAgentFunction, invokeAgent } from "@zsys/agents";
import { createApplicationContextResolver } from "@zsys/app";
import { resolveEnv } from "@zsys/config";
import { awsProviderFactories } from "@zsys/cloud-aws/runtime";
import { createFunctionRegistry, createProviderRegistry, invoke, materializeEvents, materializeJobs } from "@zsys/engine";
import { createRegistrationPlan } from "@zsys/graph";
import { installInspectorEndpoints } from "@zsys/inspector-api";
import { createObservabilityRuntime } from "@zsys/observability";
import { standardProviderFactories } from "@zsys/providers-standard";
import { consoleHumanSink, formatHumanLog, redactFailureDetail } from "@zsys/runtime-effect";
import { createApp, createHttpAuthRuntime } from "@zsys/runtime-hono";
import { runtimeManifest } from "./runtime.manifest.ts";

const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const openapiDocument = ${canonicalJson(openapi)};
const clientContractDocument = ${canonicalJson(clientContract)};
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
const authRequestStorage = new AsyncLocalStorage();
const authRuntime = createAuthRegistration(graph, runtimeManifest.routes);
const environmentResolution = resolveRuntimeEnvironment(application.env, environment, sourceValues);
const values = environmentResolution.values;
const sentry = await createSentry(application.sentry, values);
globalThis["__zsys_flush_sentry"] = () => sentry?.flush(1_000);
const contextResolver = createApplicationContextResolver({
  constants: runtimeManifest.constants,
  prompts: runtimeManifest.prompts,
  env: values,
});
const databaseContext = createDatabaseRegistration(runtimeManifest.dataModel);
bindAgents();
const registry = createFunctionRegistry(graph, executableManifest);
const providerFactories = { ...standardProviderFactories, ...awsProviderFactories };
let materializedJobs;
let jobWorker;
const providerStartup = (environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, environment, providers: { buckets: application.buckets, cache: application.caches, jobs: application.jobs, events: application.events, models: application.models, observability: application.observability }, graph, values, environmentMetadata: application.env.metadata, signal: shutdownController.signal, factories: providerFactories })
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
  responseMapping: { mode: environment },
  middlewareContext: routeMiddlewareContext,
  middleware: { generationId, observability: telemetry, maxBodyBytes: ${configuration.maxBodyBytes} },
  apiDocs: {
    mode: environment,
    document: openapiDocument,
    enabledInProduction: ${String(configuration.apiDocs.enabledInProduction)},
    ...(process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.ZSYS_INTERNAL_ENDPOINT_TOKEN }),
  },
  clientContract: {
    enabled: ${String(configuration.clientContract)},
    document: clientContractDocument,
  },
  mcp: { enabled: ${String(configuration.mcp)} },
  staticFiles: { root: process.env.ZSYS_PUBLIC_ROOT ?? new URL("../public", import.meta.url).pathname },
  rateLimitRuntime: { resolveStore: resolveRateLimitStore },
  ...(authRuntime === undefined ? {} : { auth: authRuntime }),
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
    resources: {
      buckets: {
        supports: (bucketId) => supportsInspector("buckets", plan.buckets, bucketId, "list", "preview"),
        list: async ({ bucketId, ...request }) => (await resourceInspector("buckets", plan.buckets, bucketId)).list(request),
        preview: async ({ bucketId, ...request }) => (await resourceInspector("buckets", plan.buckets, bucketId)).preview(request),
      },
      cache: {
        supports: (cacheId) => supportsInspector("cache", plan.caches, cacheId, "scan", "value"),
        scan: async ({ cacheId, ...request }) => (await resourceInspector("cache", plan.caches, cacheId)).scan(request),
        value: async ({ cacheId, ...request }) => (await resourceInspector("cache", plan.caches, cacheId)).value(request),
      },
    },
  },
  maxPreviewBytes: ${configuration.maxPreviewBytes},
  query: telemetry.query,
  stream: telemetry.stream,
});
const server = Bun.serve({
  hostname: "0.0.0.0",
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
${SERVER_INVOCATION_SOURCE}
${SERVER_RUNTIME_SOURCE}
${SERVER_SHUTDOWN_SOURCE}
`;
}
