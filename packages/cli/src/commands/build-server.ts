import { canonicalJson } from "@relkit/contracts";
import type { JsonValue } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { serverHttpSource, type ServerSourceConfiguration } from "./build-server-http.js";
import { SERVER_INVOCATION_SOURCE } from "./build-server-invocation.js";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
import { SERVER_SHUTDOWN_SOURCE } from "./build-server-shutdown.js";
/** Emits the one Bun entrypoint used by dev, start, and the production container. */
export function serverSource(
  graph: ApplicationGraph,
  graphHash: string,
  openapi: JsonValue = {},
  clientContract: JsonValue = {},
  configuration: ServerSourceConfiguration = {
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
    clientContract: true,
    mcp: true,
    maxPreviewBytes: 1_048_576,
  },
): string {
  const serviceCapabilities = graph.nodes
    .filter((node) => node.kind === "service")
    .map((node) => node.capability?.kind);
  const specializedImports = [
    serviceCapabilities.includes("better-auth")
      ? 'import { activateBetterAuthService } from "@relkit/better-auth";'
      : undefined,
    serviceCapabilities.includes("drizzle")
      ? 'import { activateDrizzleService } from "@relkit/drizzle/internal";'
      : undefined,
  ]
    .filter((value) => value !== undefined)
    .join("\n");
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createGeneratedAgentFunction, invokeAgent } from "@relkit/agents";
import { createApplicationContextResolver } from "@relkit/app";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { awsProviderFactories } from "@relkit/cloud-aws/runtime";
import { createFunctionRegistry, createProviderRegistry, invoke, materializeEvents, materializeJobs } from "@relkit/engine";
import { createRegistrationPlan } from "@relkit/graph";
import { installInspectorEndpoints } from "@relkit/inspector-api";
import { createObservabilityRuntime } from "@relkit/observability";
import { standardProviderFactories } from "@relkit/providers-standard";
import { consoleHumanSink, formatHumanLog, redactFailureDetail } from "@relkit/runtime-effect";
import { createApp, createHttpAuthRuntime } from "@relkit/runtime-hono";
import { runtimeManifest } from "./runtime.manifest.ts";

const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const openapiDocument = ${canonicalJson(openapi)};
const clientContractDocument = ${canonicalJson(clientContract)};
const plan = createRegistrationPlan(graph);
if (plan.graphHash !== graphHash) throw new Error("Runtime graph hash verification failed.");
const environment = resolveEnvironment(process.env.RELKIT_ENV, process.env.NODE_ENV);
const generationId = process.env.RELKIT_GENERATION_ID ?? "generation.runtime";
const sourceToken = tokenFrom(process.env.RELKIT_SOURCE_TOKEN);
const generationToken = tokenFrom(process.env.RELKIT_GENERATION_TOKEN);
const sourceValues = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
const shutdownController = new AbortController();
const telemetry = await createObservabilityRuntime({ root: process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability" });
globalThis["__relkit_flush_telemetry"] = telemetry.flush;
const executableManifest = { ...runtimeManifest, functions: { ...runtimeManifest.functions } };
const application = runtimeManifest.application;
if (application === undefined) throw new Error("Runtime application metadata is unavailable.");
const environmentResolution = resolveRuntimeEnvironment(application.env, environment, sourceValues);
const values = environmentResolution.values;
const databaseNode = plan.services?.find((service) => service.capability?.kind === "drizzle");
const authNode = plan.services?.find((service) => service.capability?.kind === "better-auth");
const databaseStartup = createDatabaseRegistration(databaseNode, runtimeManifest.services, values);
const authStartup = createBetterAuthRegistration(authNode, runtimeManifest.services, databaseStartup);
const authRequestStorage = new AsyncLocalStorage();
const authRuntime = createAuthRegistration(graph, runtimeManifest.routes, authStartup);
const sentry = await createSentry(application.sentry, values);
globalThis["__relkit_flush_sentry"] = () => sentry?.flush(1_000);
const contextResolver = createApplicationContextResolver({
  constants: runtimeManifest.constants,
  prompts: runtimeManifest.prompts,
  env: values,
});
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
let databaseReady = databaseNode === undefined;
let authReady = authNode === undefined;
let specializedFailed = false;
databaseStartup?.then(() => { databaseReady = true; }).catch((error) => {
  specializedFailed = true;
  recordRuntimeFailure("runtime.database", "Database startup failed", error, "direct");
});
authStartup?.then(() => { authReady = true; }).catch((error) => {
  specializedFailed = true;
  recordRuntimeFailure("runtime.auth", "Auth startup failed", error, "http");
});
const activeInvocations = new Set();
let stopping = false;
${serverHttpSource(configuration)}
${SERVER_INVOCATION_SOURCE}
${SERVER_RUNTIME_SOURCE}
${SERVER_SHUTDOWN_SOURCE}
`;
}
