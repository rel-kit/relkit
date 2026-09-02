import { deepFreeze, isStableId, serializeJson, type JsonValue } from "@relkit/contracts";
import type { ProviderLocalRecipeReference } from "@relkit/provider";

export * from "./recipe.js";

export const LOCAL_SERVICE_PROTOCOL_VERSION = 1 as const;
export const LOCAL_SERVICE_PLAN_VERSION = 1 as const;
export const LOCAL_SERVICE_PLAN_FILE = "local-services.plan.json" as const;
export const LOCAL_SERVICE_STATE_VERSION = 1 as const;
export const LOCAL_SERVICE_STATE_FILE = "local-services.state.json" as const;
export const PROVIDER_OVERRIDE_STATE_VERSION = 1 as const;
export const PROVIDER_OVERRIDE_STATE_FILE = "provider-overrides.json" as const;

export interface LocalServiceMaterializerMetadata<IntegrationId extends string = string> {
  readonly kind: "local-service-materializer";
  readonly protocolVersion: typeof LOCAL_SERVICE_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
}

export interface LocalServicePlanEntry {
  readonly bindingId: string;
  readonly capability: string;
  readonly profile: string;
  readonly materializerId: string;
  readonly recipe: ProviderLocalRecipeReference;
  readonly configuration: JsonValue;
  readonly requiredBy: readonly string[];
}

export interface LocalServicePlan {
  readonly version: typeof LOCAL_SERVICE_PLAN_VERSION;
  readonly graphHash: string;
  readonly services: readonly LocalServicePlanEntry[];
}

export type LocalServicePhase = "pending" | "starting" | "healthy" | "unhealthy" | "stopped";

export interface LocalServiceBindingState {
  readonly bindingId: string;
  readonly recipe: ProviderLocalRecipeReference;
  readonly phase: LocalServicePhase;
  readonly message?: string;
}

export interface LocalServiceState {
  readonly version: typeof LOCAL_SERVICE_STATE_VERSION;
  readonly applicationId: string;
  readonly localProjectId: string;
  readonly planHash: string;
  readonly services: readonly LocalServiceBindingState[];
}

export interface ProviderOverrideBinding {
  readonly bindingId: string;
  readonly values: Readonly<Record<string, JsonValue>>;
}

export interface ProviderOverrideState {
  readonly version: typeof PROVIDER_OVERRIDE_STATE_VERSION;
  readonly applicationId: string;
  readonly localProjectId: string;
  readonly planHash: string;
  readonly generationId: string;
  readonly bindings: readonly ProviderOverrideBinding[];
}

export interface ProviderOverrideExpectation {
  readonly applicationId: string;
  readonly planHash: string;
  readonly generationId: string;
}

export type LocalServiceVersionErrorCode =
  | "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED"
  | "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED"
  | "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED";

export class LocalServiceVersionError extends TypeError {
  constructor(
    readonly code: LocalServiceVersionErrorCode,
    label: string,
    version: unknown,
    expected: number,
    command: string,
  ) {
    super(
      `${label} version ${String(version)} is unsupported; expected ${expected}. Regenerate with \`${command}\`.`,
    );
    this.name = "LocalServiceVersionError";
  }
}

export function assertLocalServicePlanVersion(value: unknown): asserts value is LocalServicePlan {
  assertVersion(
    value,
    LOCAL_SERVICE_PLAN_VERSION,
    "Local-service plan",
    "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED",
    "relkit check",
  );
}

export function assertLocalServiceStateVersion(value: unknown): asserts value is LocalServiceState {
  assertVersion(
    value,
    LOCAL_SERVICE_STATE_VERSION,
    "Local-service state",
    "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED",
    "relkit local up",
  );
}

export function assertProviderOverrideStateVersion(
  value: unknown,
): asserts value is ProviderOverrideState {
  assertVersion(
    value,
    PROVIDER_OVERRIDE_STATE_VERSION,
    "Provider-override state",
    "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    "relkit local up",
  );
}

export function providerOverrideBindingValues(
  value: unknown,
  expected: ProviderOverrideExpectation,
): Readonly<Record<string, Readonly<Record<string, JsonValue>>>> {
  assertProviderOverrideStateVersion(value);
  if (
    value.applicationId !== expected.applicationId ||
    value.planHash !== expected.planHash ||
    value.generationId !== expected.generationId ||
    !isStableId(value.applicationId) ||
    !isStableId(value.generationId) ||
    !hash(value.localProjectId) ||
    !hash(value.planHash) ||
    !Array.isArray(value.bindings)
  ) {
    invalidOverride();
  }
  const bindings: Record<string, Readonly<Record<string, JsonValue>>> = {};
  for (const binding of value.bindings) {
    if (
      !record(binding) ||
      !isStableId(binding.bindingId) ||
      !record(binding.values) ||
      Object.hasOwn(bindings, binding.bindingId) ||
      !Object.keys(binding.values).every(isStableId)
    ) {
      invalidOverride();
    }
    try {
      serializeJson(binding.values);
    } catch {
      invalidOverride();
    }
    bindings[binding.bindingId] = binding.values as Readonly<Record<string, JsonValue>>;
  }
  return deepFreeze(bindings);
}

function assertVersion(
  value: unknown,
  expected: number,
  label: string,
  code: LocalServiceVersionErrorCode,
  command: string,
): void {
  const version = isRecord(value) ? value.version : undefined;
  if (version !== expected)
    throw new LocalServiceVersionError(code, label, version, expected, command);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function invalidOverride(): never {
  throw new TypeError("Provider-override state does not match the runtime activation.");
}
