/**
 * Shares precise inputs between pure server emission fragments. These values
 * come from successful compilation and contain declarations rather than acquired
 * runtime resources; generated hosts own the resulting process lifecycle.
 */
import type { JsonValue, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";

/** Validated HTTP settings supplied to the pure generated-server emitter. */
export interface ServerSourceConfiguration {
  /** Prepared capsules select the scoped transport facade; production remains eager. */
  readonly httpApplication?: "prepared";
  readonly maxBodyBytes: number;
  readonly apiDocs: {
    readonly enabledInProduction: boolean;
    readonly excludeDomains?: readonly string[];
  };
  readonly clientContract: boolean;
  readonly mcp: boolean;
  readonly maxPreviewBytes: number;
}

/** Pure source fragments derived from activation identities and declared features. */
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

/** Optional agent dependencies participate only when the graph declares agents. */
export interface ServerAgentSource {
  readonly imports: string;
  readonly startup: string;
  readonly registration: string;
  readonly release: string;
}

/** One accepted cohort supplies every fragment without reevaluation. */
export interface ServerSourceEmission {
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
  readonly activation: RuntimeActivationFingerprint;
  readonly openapi: JsonValue;
  readonly clientContract: JsonValue;
  readonly configuration: ServerSourceConfiguration;
  readonly options: ServerSourceOptions;
  readonly agentSource: ServerAgentSource;
}
