import type {
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "./runtime-integration.js";

/** Reference to the integration plan associated with a graph. */
export interface RuntimeIntegrationPlanReference {
  readonly version: typeof RUNTIME_INTEGRATION_PLAN_VERSION;
  readonly fileName: typeof RUNTIME_INTEGRATION_PLAN_FILE;
  readonly graphHash: string;
}

/** One capability registration exposed by an integration. */
export interface RuntimeIntegrationRegistrationMetadata {
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
}

/** Metadata emitted by a runtime integration module. */
export interface RuntimeIntegrationModuleMetadata {
  readonly kind: "runtime-integration";
  readonly integrationId: string;
  readonly registrations: readonly RuntimeIntegrationRegistrationMetadata[];
}

/** Resolved integration registration in a deployment plan. */
export interface RuntimeIntegrationPlanEntry {
  readonly integrationId: string;
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}

/** Versioned integration plan consumed by the runtime. */
export interface RuntimeIntegrationPlan {
  readonly version: typeof RUNTIME_INTEGRATION_PLAN_VERSION;
  readonly graphHash: string;
  readonly integrations: readonly RuntimeIntegrationPlanEntry[];
}
