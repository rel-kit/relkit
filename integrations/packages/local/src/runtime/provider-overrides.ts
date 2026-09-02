import { randomUUID } from "node:crypto";
import { deepFreeze, isStableId, serializeJson, type JsonValue } from "@relkit/contracts";
import {
  PROVIDER_OVERRIDE_STATE_FILE,
  PROVIDER_OVERRIDE_STATE_VERSION,
  type ProviderOverrideBinding,
  type ProviderOverrideState,
} from "@relkit/local-service";
import type { LocalProjectIdentity } from "./identity.js";
import { readLocalStateText, removeLocalStateFile, writeLocalStateText } from "./state-paths.js";

export interface ProviderOverrideSummary {
  readonly generationId: string;
  readonly planHash: string;
  readonly bindingIds: readonly string[];
}

export class ProviderOverrideError extends Error {
  constructor(readonly code: "RELKIT_LOCAL_OVERRIDE_INVALID" | "RELKIT_LOCAL_OVERRIDE_STALE") {
    super(
      code === "RELKIT_LOCAL_OVERRIDE_STALE"
        ? "Local overrides are stale."
        : "Local overrides are invalid.",
    );
    this.name = "ProviderOverrideError";
  }
}

export function writeProviderOverrides(
  identity: LocalProjectIdentity,
  planHash: string,
  bindings: readonly ProviderOverrideBinding[],
): ProviderOverrideSummary {
  if (!hash(planHash)) invalid();
  const normalized = normalizeBindings(bindings);
  const state = deepFreeze({
    version: PROVIDER_OVERRIDE_STATE_VERSION,
    applicationId: identity.applicationId,
    localProjectId: identity.localProjectId,
    planHash,
    generationId: randomUUID(),
    bindings: normalized,
  }) satisfies ProviderOverrideState;
  writeLocalStateText(identity, PROVIDER_OVERRIDE_STATE_FILE, `${serializeJson(state)}\n`);
  return summary(state);
}

export function readProviderOverrides(
  identity: LocalProjectIdentity,
  expectedPlanHash?: string,
): ProviderOverrideState | undefined {
  if (expectedPlanHash !== undefined && !hash(expectedPlanHash)) invalid();
  const source = readLocalStateText(identity, PROVIDER_OVERRIDE_STATE_FILE);
  if (source === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return invalid();
  }
  if (!isRecord(value) || !Array.isArray(value.bindings)) invalid();
  if (
    value.version !== PROVIDER_OVERRIDE_STATE_VERSION ||
    value.applicationId !== identity.applicationId ||
    value.localProjectId !== identity.localProjectId ||
    !hash(value.planHash) ||
    !isStableId(value.generationId)
  ) {
    invalid();
  }
  const bindings = normalizeBindings(value.bindings as ProviderOverrideBinding[]);
  if (expectedPlanHash !== undefined && value.planHash !== expectedPlanHash) stale();
  return deepFreeze({ ...value, bindings }) as unknown as ProviderOverrideState;
}

export function summarizeProviderOverrides(state: ProviderOverrideState): ProviderOverrideSummary {
  return summary({ ...state, bindings: normalizeBindings(state.bindings) });
}

export function removeProviderOverrides(identity: LocalProjectIdentity): void {
  removeLocalStateFile(identity, PROVIDER_OVERRIDE_STATE_FILE);
}

function normalizeBindings(
  bindings: readonly ProviderOverrideBinding[],
): ProviderOverrideBinding[] {
  if (!Array.isArray(bindings)) invalid();
  const normalized = bindings.map((binding) => {
    if (
      !isRecord(binding) ||
      !isStableId(binding.bindingId) ||
      !isRecord(binding.values) ||
      !Object.keys(binding.values).every(isStableId)
    ) {
      invalid();
    }
    try {
      serializeJson(binding.values);
    } catch {
      invalid();
    }
    return deepFreeze({
      bindingId: binding.bindingId,
      values: binding.values as Readonly<Record<string, JsonValue>>,
    });
  });
  normalized.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  if (new Set(normalized.map((binding) => binding.bindingId)).size !== normalized.length) invalid();
  return normalized;
}

function summary(state: ProviderOverrideState): ProviderOverrideSummary {
  if (!hash(state.planHash) || !isStableId(state.generationId)) invalid();
  return Object.freeze({
    generationId: state.generationId,
    planHash: state.planHash,
    bindingIds: Object.freeze(state.bindings.map((binding) => binding.bindingId).sort()),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function invalid(): never {
  throw new ProviderOverrideError("RELKIT_LOCAL_OVERRIDE_INVALID");
}

function stale(): never {
  throw new ProviderOverrideError("RELKIT_LOCAL_OVERRIDE_STALE");
}
