/**
 * Emits the identity portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */
import { canonicalJson, RUNTIME_INTEGRATION_PLAN_VERSION } from "@relkit/contracts";
import type { ServerSourceEmission } from "./build-server.types.js";
import { serverRegistrationPlanSource } from "./build-server-plan.js";

/**
 * Emits this stage from the same complete compilation result as every neighbor.
 * @param input - Accepted graph/cohort and feature-selected emission fragments.
 * @returns Pure source text; no descriptors are reevaluated.
 */
export function serverIdentitySource(input: ServerSourceEmission): string {
  const { graph, graphHash, activation, openapi, clientContract, options } = input;
  const {
    jobsManifestVerification,
    localServicesVerification,
    providerOverridesSource,
    localServicesInspectorSource,
  } = options;
  return `const graph = ${canonicalJson(graph)};
const graphHash = ${JSON.stringify(graphHash)};
const activationFingerprint = ${canonicalJson(activation)};
const openapiDocument = ${canonicalJson(openapi)};
const clientContractDocument = ${canonicalJson(clientContract)};
const publicFingerprint = clientContractDocument.publicFingerprint ?? graphHash;
${serverRegistrationPlanSource(input)}
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
const generationId = ${input.configuration.httpApplication === "prepared" ? "`generation-${tokenFrom(process.env.RELKIT_GENERATION_TOKEN)}`" : 'process.env.RELKIT_GENERATION_ID ?? "generation.runtime"'};
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
`;
}
