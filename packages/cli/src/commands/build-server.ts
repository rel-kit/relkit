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
import { SERVER_BOOTSTRAP_SOURCE } from "./build-server-bootstrap.js";
/**
 * Emits the Bun entrypoint shared by dev, start, and the production container.
 * @param graph - Validated application graph.
 * @param graphHash - Graph identity verified by the generated host.
 * @param activation - Atomic artifact activation identity.
 * @param openapi - Generated HTTP documentation.
 * @param clientContract - Generated client protocol contract.
 * @param configuration - Validated HTTP build configuration.
 * @returns Pure source text; resource lifetimes are delegated to the typed runtime helper.
 */
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
import { Effect } from "effect";
import { createServerRuntimeHost } from "@relkit/cli/internal/server-runtime";
${providerOverridesImport}
import { assertAgentRuntimeDependencies, createGeneratedAgentFunction, invokeAgent, releaseAgentPersistence } from "@relkit/agents";
import { createApplicationContextResolver } from "@relkit/app";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { assertRuntimeIntegrationModules, createFunctionRegistry, createProviderRegistry, createTaskExecutor, invoke, materializeEvents, materializeJobs, parseInfrastructureBindingValues } from "@relkit/engine";
import { createRegistrationPlan } from "@relkit/graph";
import { installInspectorEndpoints, InspectorQueryError } from "@relkit/inspector-api";
import { currentExecutionContext, publicTrace } from "@relkit/invocation";
import { createObservabilityRuntime, createTelemetryExporterFanout } from "@relkit/observability";
import { consoleHumanSink, createLoggerLayer, formatHumanLog, stdoutJsonSink, redactFailureDetail } from "@relkit/runtime-effect";
import { createApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono";
import { honoWebSocket, upgradeWebSocket } from "@relkit/runtime-hono/bun";
import { createProviderRealtimeDispatcher, setActiveRealtimeDispatcher } from "@relkit/realtime";
import { createJobsControls, createJobsRuntime, reconcileNativeSchedules, runInJobsRuntime } from "@relkit/jobs";
import runtimeIntegrationsPlan from "./${RUNTIME_INTEGRATION_PLAN_FILE}" with { type: "json" };
import { runtimeIntegrationModules } from "./runtime-integrations.ts";
${localServicesImport}
${jobsManifestImport}
import { runtimeManifest } from "./runtime.manifest.ts";
${SERVER_BOOTSTRAP_SOURCE}

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
const databaseNode = plan.services?.find((service) => service.capability?.kind === "drizzle");
const authNode = plan.services?.find((service) => service.capability?.kind === "better-auth");
let runtimeReport = () => {};
let runtimeWrite = () => {};
let telemetry;
const runtimeOwner = await createServerRuntimeHost({ ready: { database: databaseNode === undefined, auth: authNode === undefined }, annotations: { generationId, graphHash, source: "direct" }, report: (failure, cleanup) => runtimeReport(failure, cleanup), logger: { component: "runtime.lifecycle", minimumLevel: process.env.RELKIT_DEV_LOGS === "1" ? "all" : "info", collector: { collect: (record) => telemetry?.collect(record) }, human: { write: (_line, record) => runtimeWrite(record) }, json: false } });
const shutdownController = { signal: runtimeOwner.signal };
const runtimeState = () => runtimeOwner.snapshot();
try {
const telemetryConfiguration = graph.nodes.find((node) => node.kind === "app")?.telemetry;
assertRuntimeIntegrationModules(runtimeIntegrationsPlan, runtimeIntegrationModules);
const telemetryExporters = await runtimeOwner.resource("telemetry.exporters", (signal) => createTelemetryExporterFanout({ exporters: telemetryConfiguration?.exporters, modules: runtimeIntegrationModules, values: sourceValues, signal }), (value) => value.close(), undefined, "telemetry");
telemetry = await runtimeOwner.resource("telemetry", () => createObservabilityRuntime({ root: process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability", configuration: telemetryConfiguration, exporter: telemetryExporters,
  ...(environment !== "production" && process.env.RELKIT_TELEMETRY_URL && process.env.RELKIT_TELEMETRY_TOKEN ? {
    remote: { url: process.env.RELKIT_TELEMETRY_URL, token: process.env.RELKIT_TELEMETRY_TOKEN }
  } : {}) }), (value) => value.close(), undefined, "telemetry");
runtimeWrite = writeRuntimeLog;
runtimeReport = (failure, cleanup) => {
  const operation = failure.operation;
  const component = operation.startsWith("telemetry") ? "telemetry" : operation.startsWith("database") ? "database" : operation.startsWith("auth") ? "auth" : operation === "native-job-worker" ? "native-job-worker" : operation.startsWith("native-job") ? "native-job-registration" : operation.startsWith("job-worker") ? "job-worker" : operation.startsWith("provider") ? "provider" : "lifecycle";
  const labels = { provider: "Provider", database: "Database", auth: "Auth", telemetry: "Telemetry", "native-job-registration": "Native jobs worker registration", "native-job-worker": "Native jobs worker", "job-worker": "Job worker", lifecycle: "Runtime" };
  const suffix = cleanup ? " cleanup failed" : component.endsWith("worker") || component === "native-job-registration" ? " failed" : " startup failed";
  recordRuntimeFailure("runtime." + component, labels[component] + suffix, failure.cause, component === "auth" ? "http" : component.includes("job") ? "job" : "direct");
};
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
const specializedInstrumentation = await Effect.runPromise(
  Effect.context().pipe(
    Effect.annotateLogs({ generationId, graphHash, source: "direct" }),
    Effect.provide(createLoggerLayer({
      component: "runtime.specialized",
      minimumLevel: process.env.RELKIT_DEV_LOGS === "1" ? "all" : "info",
      collector: telemetry,
      human: { write: (_line, record) => writeRuntimeLog(record) },
      json: false,
    })),
  ),
);
const databaseStartup = databaseNode === undefined ? undefined : runtimeOwner.resource("database", () => createDatabaseRegistration(databaseNode, runtimeManifest.services, values), (value) => value.close(), () => runtimeOwner.setReady("database", true));
const authStartup = authNode === undefined ? undefined : runtimeOwner.resource("auth", () => createBetterAuthRegistration(authNode, runtimeManifest.services, databaseStartup), () => {}, () => runtimeOwner.setReady("auth", true));
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
let nativeJobsRuntimes = new Map();
const nativeJobWorkerRegistrations = new Set();
const nativeJobWorkerReadyHandles = new Set();
const nativeJobWorkerEndpoints = new Map();
const providerStartup = runtimeOwner.resource("provider", (signal) => environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, graph, runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues, infrastructureBindingValues, signal })
  : Promise.reject(environmentResolution.error), (value) => value.dispose(), async (value) => {
  if ((plan.channels ?? []).length > 0) setActiveRealtimeDispatcher(createProviderRealtimeDispatcher({ applicationId: graph.appId, environment, generationId, publicFingerprint, provider: (profile) => provider(value, "realtime", profile) }));
  await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  materializedJobs = await materializeJobs({ plan, engine: { invoke: invokeHttp }, createQueue: (context) => queueProvider(value, context), spanRuntime });
  if (plan.queues.length > 0) await startJobWorker(materializedJobs);
  nativeJobsRuntimes = await createNativeJobsRuntimes(value);
  await startNativeJobWorker(nativeJobsRuntimes);
  await runtimeOwner.providerDelay();
  runtimeOwner.setReady("provider", true);
}, "application", false).catch((error) => {
  return undefined;
});
void databaseStartup?.catch(() => {});
void authStartup?.catch(() => {});
${serverHttpSource(configuration)}
${SERVER_INVOCATION_SOURCE}
${SERVER_REGISTRATION_SOURCE}
${SERVER_NATIVE_WORKER_SOURCE}
${SERVER_RUNTIME_SOURCE}
${SERVER_SHUTDOWN_SOURCE}
} catch (error) {
  await runtimeOwner.shutdown(async () => {});
  throw error;
}
`;
}
