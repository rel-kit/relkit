import {
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  canonicalJson,
} from "@relkit/contracts";
import type { JsonValue, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { serverSourceOptions } from "./build-server-options.js";
import { serverHttpSource, type ServerSourceConfiguration } from "./build-server-http.js";
import { SERVER_INVOCATION_SOURCE } from "./build-server-invocation.js";
import { SERVER_NATIVE_WORKER_SOURCE } from "./build-server-native-worker.js";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
import { SERVER_REGISTRATION_SOURCE } from "./build-server-registration.js";
import { SERVER_SHUTDOWN_SOURCE } from "./build-server-shutdown.js";
/** Emits the one Bun entrypoint used by dev, start, and the production container. */
export function serverSource(
  graph: ApplicationGraph,
  graphHash: string,
  activation: RuntimeActivationFingerprint,
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
  const {
    specializedImports,
    localServicesImport,
    jobsManifestImport,
    jobsManifestVerification,
    localServicesVerification,
    localServicesInspectorSource,
    providerOverridesImport,
    providerOverridesSource,
  } = serverSourceOptions(graph, activation);
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
${providerOverridesImport}
import { assertAgentRuntimeDependencies, createGeneratedAgentFunction, invokeAgent, releaseAgentPersistence } from "@relkit/agents";
import { createApplicationContextResolver } from "@relkit/app";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { assertRuntimeIntegrationModules, createFunctionRegistry, createProviderRegistry, createTaskExecutor, invoke, materializeEvents, materializeJobs, parseInfrastructureBindingValues } from "@relkit/engine";
import { createRegistrationPlan } from "@relkit/graph";
import { installInspectorEndpoints } from "@relkit/inspector-api";
import { currentExecutionContext, publicTrace } from "@relkit/invocation";
import { createObservabilityRuntime, createTelemetryExporterFanout } from "@relkit/observability";
import { consoleHumanSink, formatHumanLog, stdoutJsonSink, redactFailureDetail } from "@relkit/runtime-effect";
import { createApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono";
import { honoWebSocket, upgradeWebSocket } from "@relkit/runtime-hono/bun";
import { createProviderRealtimeDispatcher, setActiveRealtimeDispatcher } from "@relkit/realtime";
import { createJobsControls, createJobsRuntime, reconcileNativeSchedules, runInJobsRuntime } from "@relkit/jobs";
import runtimeIntegrationsPlan from "./${RUNTIME_INTEGRATION_PLAN_FILE}" with { type: "json" };
import { runtimeIntegrationModules } from "./runtime-integrations.ts";
${localServicesImport}
${jobsManifestImport}
import { runtimeManifest } from "./runtime.manifest.ts";

const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const activationFingerprint = ${canonicalJson(activation)};
const openapiDocument = ${canonicalJson(openapi)};
const clientContractDocument = ${canonicalJson(clientContract)};
const publicFingerprint = clientContractDocument.publicFingerprint ?? graphHash;
const plan = createRegistrationPlan(graph);
if (runtimeManifest.application?.compatibility?.legacyJobs !== true && plan.queues.some((node) => node.kind === "job" && (node.executionModel === undefined || node.executionModel === "legacy-function"))) throw new Error("RELKIT_LEGACY_JOBS_DISABLED");
const artifactHash = (value) => "sha256:" + createHash("sha256").update(JSON.stringify(value) + "\\n").digest("hex");
if (plan.graphHash !== graphHash) throw new Error("Runtime graph hash verification failed.");
if (JSON.stringify(runtimeManifest.activationFingerprint) !== JSON.stringify(activationFingerprint)) throw new Error("Runtime activation fingerprint verification failed.");
${jobsManifestVerification}
const nativeJobsManifest = ${activation.jobsManifestHash === undefined ? "undefined" : "jobsManifest"};
if (runtimeIntegrationsPlan.version !== ${RUNTIME_INTEGRATION_PLAN_VERSION}) throw new Error("Runtime integration plan version " + String(runtimeIntegrationsPlan.version) + " is unsupported; rebuild with relkit build.");
if (runtimeIntegrationsPlan.graphHash !== graphHash) throw new Error("Runtime integration plan does not match the application graph; rebuild with relkit build.");
if (artifactHash(runtimeIntegrationsPlan) !== activationFingerprint.runtimeIntegrationsPlanHash) throw new Error("Runtime integration plan fingerprint verification failed.");
${localServicesVerification}
${providerOverridesSource}
${localServicesInspectorSource}
const environment = resolveEnvironment(process.env.RELKIT_ENV, process.env.NODE_ENV);
const generationId = process.env.RELKIT_GENERATION_ID ?? "generation.runtime";
const sourceToken = tokenFrom(process.env.RELKIT_SOURCE_TOKEN);
const generationToken = tokenFrom(process.env.RELKIT_GENERATION_TOKEN);
const sourceValues = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
const infrastructureBindingValues = parseInfrastructureBindingValues(process.env.RELKIT_INFRASTRUCTURE_BINDINGS);
const shutdownController = new AbortController();
const telemetryConfiguration = graph.nodes.find((node) => node.kind === "app")?.telemetry;
assertRuntimeIntegrationModules(runtimeIntegrationsPlan, runtimeIntegrationModules);
const telemetryExporters = await createTelemetryExporterFanout({ exporters: telemetryConfiguration?.exporters, modules: runtimeIntegrationModules, values: sourceValues, signal: shutdownController.signal });
const telemetry = await createObservabilityRuntime({ root: process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability", configuration: telemetryConfiguration, exporter: telemetryExporters,
  ...(environment !== "production" && process.env.RELKIT_TELEMETRY_URL && process.env.RELKIT_TELEMETRY_TOKEN ? {
    remote: { url: process.env.RELKIT_TELEMETRY_URL, token: process.env.RELKIT_TELEMETRY_TOKEN }
  } : {}) });
globalThis["__relkit_flush_telemetry"] = telemetry.flush;
const spanRuntime = createHttpSpanRuntime({ generationId, graphHash, observability: telemetry });
const executableManifest = {
  ...runtimeManifest,
  functions: { ...runtimeManifest.functions },
  targets: { ...runtimeManifest.targets },
};
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
const contextResolver = createApplicationContextResolver({
  constants: runtimeManifest.constants,
  prompts: runtimeManifest.prompts,
  env: values,
});
bindAgents();
await assertAgentRuntimeDependencies(Object.values(runtimeManifest.agents ?? {}));
const registry = createFunctionRegistry(graph, executableManifest);
let materializedJobs;
let jobWorker;
let nativeJobWorker;
let nativeJobsRuntimes = new Map();
let nativeJobWorkerServerReady = false;
let nativeJobWorkerReady = true;
const nativeJobWorkerRegistrations = new Set();
const nativeJobWorkerHandles = new Set();
const nativeJobWorkerReadyHandles = new Set();
const nativeJobWorkerEndpoints = new Map();
const providerStartup = (environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, graph, runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues, infrastructureBindingValues, signal: shutdownController.signal })
  : Promise.reject(environmentResolution.error)).then(async (value) => {
  if ((plan.channels ?? []).length > 0) setActiveRealtimeDispatcher(createProviderRealtimeDispatcher({ applicationId: graph.appId, environment, generationId, publicFingerprint, provider: (profile) => provider(value, "realtime", profile) }));
  await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  materializedJobs = await materializeJobs({ plan, engine: { invoke: invokeHttp }, createQueue: (context) => queueProvider(value, context), spanRuntime });
  jobWorker = plan.queues.length === 0 ? undefined : startJobWorker(materializedJobs);
  nativeJobsRuntimes = createNativeJobsRuntimes(value);
  nativeJobWorker = startNativeJobWorker(nativeJobsRuntimes);
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
${SERVER_REGISTRATION_SOURCE}
${SERVER_NATIVE_WORKER_SOURCE}
${SERVER_RUNTIME_SOURCE}
${SERVER_SHUTDOWN_SOURCE}
`;
}
