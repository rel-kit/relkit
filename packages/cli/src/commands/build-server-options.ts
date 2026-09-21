import { LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";
import type { ApplicationGraph } from "@relkit/graph";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";

export interface ServerSourceOptions {
  readonly specializedImports: string;
  readonly localServicesImport: string;
  readonly jobsManifestImport: string;
  readonly jobsManifestVerification: string;
  readonly localServicesVerification: string;
  readonly localServicesInspectorSource: string;
  readonly providerOverridesImport: string;
  readonly providerOverridesSource: string;
}

export function serverSourceOptions(
  graph: ApplicationGraph,
  activation: RuntimeActivationFingerprint,
): ServerSourceOptions {
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
  const jobsManifestImport =
    activation.jobsManifestHash === undefined
      ? ""
      : 'import jobsManifest from "../jobs.manifest.json" with { type: "json" };';
  const jobsManifestVerification =
    activation.jobsManifestHash === undefined
      ? ""
      : 'if (artifactHash(jobsManifest) !== activationFingerprint.jobsManifestHash) throw new Error("Runtime jobs manifest fingerprint verification failed.");';
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
  return {
    specializedImports,
    localServicesImport,
    jobsManifestImport,
    jobsManifestVerification,
    localServicesVerification,
    localServicesInspectorSource,
    providerOverridesImport,
    providerOverridesSource,
  };
}
