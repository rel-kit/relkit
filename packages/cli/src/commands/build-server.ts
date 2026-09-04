import {
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  canonicalJson,
} from "@relkit/contracts";
import { LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";
import type { JsonValue, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { serverHttpSource, type ServerSourceConfiguration } from "./build-server-http.js";
import { SERVER_INVOCATION_SOURCE } from "./build-server-invocation.js";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
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
  const localServicesImport =
    activation.localServicesPlanHash === undefined
      ? ""
      : 'import localServicesPlan from "./local-services.plan.json" with { type: "json" };';
  const localServicesVerification =
    activation.localServicesPlanHash === undefined
      ? ""
      : `if (localServicesPlan.version !== ${LOCAL_SERVICE_PLAN_VERSION}) throw new Error("Runtime local-service plan version " + String(localServicesPlan.version) + " is unsupported; rebuild with relkit build.");
if (localServicesPlan.graphHash !== graphHash) throw new Error("Runtime local-service plan does not match the application graph; rebuild with relkit build.");
if (artifactHash(localServicesPlan) !== activationFingerprint.localServicesPlanHash) throw new Error("Runtime local-service plan fingerprint verification failed.");`;
  const localServicesInspectorSource =
    activation.localServicesPlanHash === undefined
      ? "const localServicesInspector = undefined;"
      : `const localServicesRuntime = readLocalServiceInspectorState(process.env.RELKIT_LOCAL_SERVICE_INSPECTOR_STATE);
const localServicesInspector = { plan: localServicesPlan, ...(localServicesRuntime === undefined ? {} : { runtime: localServicesRuntime }) };`;
  const providerOverridesImport =
    activation.providerOverridesGeneration === undefined
      ? ""
      : `import { lstatSync, readFileSync } from "node:fs";
import { providerOverrideBindingValues } from "@relkit/local-service";`;
  const providerOverridesSource =
    activation.providerOverridesGeneration === undefined
      ? "const localBindingValues = undefined;"
      : `const providerOverridesFile = process.env.RELKIT_PROVIDER_OVERRIDES_FILE;
if (providerOverridesFile === undefined) throw new Error("Runtime provider-override file is required.");
const providerOverridesInfo = lstatSync(providerOverridesFile);
if (!providerOverridesInfo.isFile() || providerOverridesInfo.isSymbolicLink()) throw new Error("Runtime provider-override file is invalid.");
const localBindingValues = providerOverrideBindingValues(JSON.parse(readFileSync(providerOverridesFile, "utf8")), { applicationId: graph.appId, planHash: activationFingerprint.localServicesPlanHash, generationId: activationFingerprint.providerOverridesGeneration });`;
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
${providerOverridesImport}
import { createGeneratedAgentFunction, invokeAgent } from "@relkit/agents";
import { createApplicationContextResolver } from "@relkit/app";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { assertRuntimeIntegrationModules, createFunctionRegistry, createProviderRegistry, invoke, materializeEvents, materializeJobs, parseInfrastructureBindingValues } from "@relkit/engine";
import { createRegistrationPlan } from "@relkit/graph";
import { installInspectorEndpoints } from "@relkit/inspector-api";
import { currentExecutionContext, publicTrace } from "@relkit/invocation";
import { createObservabilityRuntime, createTelemetryExporterFanout } from "@relkit/observability";
import { consoleHumanSink, formatHumanLog, stdoutJsonSink, redactFailureDetail } from "@relkit/runtime-effect";
import { createApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono";
import runtimeIntegrationsPlan from "./${RUNTIME_INTEGRATION_PLAN_FILE}" with { type: "json" };
import { runtimeIntegrationModules } from "./runtime-integrations.ts";
${localServicesImport}
import { runtimeManifest } from "./runtime.manifest.ts";

const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const activationFingerprint = ${canonicalJson(activation)};
const openapiDocument = ${canonicalJson(openapi)};
const clientContractDocument = ${canonicalJson(clientContract)};
const plan = createRegistrationPlan(graph);
const artifactHash = (value) => "sha256:" + createHash("sha256").update(JSON.stringify(value) + "\\n").digest("hex");
if (plan.graphHash !== graphHash) throw new Error("Runtime graph hash verification failed.");
if (JSON.stringify(runtimeManifest.activationFingerprint) !== JSON.stringify(activationFingerprint)) throw new Error("Runtime activation fingerprint verification failed.");
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
const contextResolver = createApplicationContextResolver({
  constants: runtimeManifest.constants,
  prompts: runtimeManifest.prompts,
  env: values,
});
bindAgents();
const registry = createFunctionRegistry(graph, executableManifest);
let materializedJobs;
let jobWorker;
const providerStartup = (environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, graph, runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues, infrastructureBindingValues, signal: shutdownController.signal })
  : Promise.reject(environmentResolution.error)).then(async (value) => {
  await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  materializedJobs = await materializeJobs({ plan, engine: { invoke: invokeHttp }, createQueue: (context) => queueProvider(value, context), spanRuntime });
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
