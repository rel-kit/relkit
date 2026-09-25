import type { JsonValue } from "@relkit/contracts";
import type { ProviderLocalRecipeReference } from "@relkit/provider";
import type {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  LOCAL_SERVICE_STATE_VERSION,
  PROVIDER_OVERRIDE_STATE_VERSION,
} from "./protocol.js";

/** Identity of a local materializer integration.
 * @example const metadata: LocalServiceMaterializerMetadata = { kind: "local-service-materializer", protocolVersion: 1, integrationId: "docker" };
 */
export interface LocalServiceMaterializerMetadata<IntegrationId extends string = string> {
  readonly kind: "local-service-materializer";
  readonly protocolVersion: typeof LOCAL_SERVICE_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
}

/** Planned local binding and its provider recipe.
 * @example const entry = plan.services[0] as LocalServicePlanEntry;
 */
export interface LocalServicePlanEntry {
  readonly bindingId: string;
  readonly capability: string;
  readonly profile: string;
  readonly materializerId: string;
  readonly recipe: ProviderLocalRecipeReference;
  readonly configuration: JsonValue;
  readonly requiredBy: readonly string[];
}

/** Versioned local service plan.
 * @example const entries: readonly LocalServicePlanEntry[] = plan.services;
 */
export interface LocalServicePlan {
  readonly version: typeof LOCAL_SERVICE_PLAN_VERSION;
  readonly graphHash: string;
  readonly services: readonly LocalServicePlanEntry[];
}

/** Runtime lifecycle phase for one local binding.
 * @example const phase: LocalServicePhase = "healthy";
 */
export type LocalServicePhase = "pending" | "starting" | "healthy" | "unhealthy" | "stopped";

/** Observed state of one local binding.
 * @example const phase: LocalServicePhase = binding.phase;
 */
export interface LocalServiceBindingState {
  readonly bindingId: string;
  readonly recipe: ProviderLocalRecipeReference;
  readonly phase: LocalServicePhase;
  readonly environment?: string;
  readonly serviceGeneration?: string;
  readonly units?: readonly string[];
  readonly message?: string;
}

/** Versioned state for all local bindings.
 * @example const bindings: readonly LocalServiceBindingState[] = state.services;
 */
export interface LocalServiceState {
  readonly version: typeof LOCAL_SERVICE_STATE_VERSION;
  readonly applicationId: string;
  readonly localProjectId: string;
  readonly planHash: string;
  readonly services: readonly LocalServiceBindingState[];
}

/** Resolved override values for one provider binding.
 * @example const url = binding.values.url;
 */
export interface ProviderOverrideBinding {
  readonly bindingId: string;
  readonly values: Readonly<Record<string, JsonValue>>;
}

/** Versioned override state bound to one activation.
 * @example const bindings: readonly ProviderOverrideBinding[] = overrides.bindings;
 */
export interface ProviderOverrideState {
  readonly version: typeof PROVIDER_OVERRIDE_STATE_VERSION;
  readonly applicationId: string;
  readonly localProjectId: string;
  readonly planHash: string;
  readonly generationId: string;
  readonly bindings: readonly ProviderOverrideBinding[];
}

/** Expected activation identity for provider override lookup.
 * @example const expected: ProviderOverrideExpectation = { applicationId: "demo", planHash, generationId: "generation-1" };
 */
export interface ProviderOverrideExpectation {
  readonly applicationId: string;
  readonly planHash: string;
  readonly generationId: string;
}

/** Stable error codes for unsupported artifact versions.
 * @example const code: LocalServiceVersionErrorCode = "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED";
 */
export type LocalServiceVersionErrorCode =
  | "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED"
  | "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED"
  | "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED";
