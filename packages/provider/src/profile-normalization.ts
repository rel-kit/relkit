import { deepFreeze, normalizeId, serializeJson } from "@relkit/contracts";
import { normalizeProviderSource } from "./source-normalization.js";
import type {
  NormalizedProviderSource,
  ProviderAdapter,
  ProviderCapability,
  ProviderSourceInput,
} from "./protocol-types.js";

export type ProviderInput<Binding> = Binding | Readonly<Record<string, Binding>>;

export interface NormalizedProviderProfiles<Adapter extends ProviderAdapter = ProviderAdapter> {
  readonly kind: "normalized-provider-profiles";
  readonly capability: string;
  readonly profiles: Readonly<Record<string, NormalizedProviderSource<Adapter>>>;
}

export type ProviderProfileSelectionSource = "descriptor" | "default" | "sole";

export interface ProviderProfileSelection<Adapter extends ProviderAdapter = ProviderAdapter> {
  readonly capability: string;
  readonly profile: string;
  readonly source: ProviderProfileSelectionSource;
  readonly binding: NormalizedProviderSource<Adapter>;
}

export class ProviderProfileSelectionError extends TypeError {
  readonly code: "AMBIGUOUS_PROVIDER_PROFILE" | "UNKNOWN_PROVIDER_PROFILE";
  readonly capability: string;
  readonly descriptorId: string;
  readonly profiles: readonly string[];

  constructor(
    code: ProviderProfileSelectionError["code"],
    capability: string,
    descriptorId: string,
    profiles: readonly string[],
    reason: string,
  ) {
    super(
      `${capability} logical descriptor "${descriptorId}" ${reason}; available profiles: ${profiles.join(", ")}`,
    );
    this.name = "ProviderProfileSelectionError";
    this.code = code;
    this.capability = capability;
    this.descriptorId = descriptorId;
    this.profiles = profiles;
  }
}

export function normalizeProviderProfiles<Adapter extends ProviderAdapter>(
  capability: ProviderCapability,
  input: ProviderInput<ProviderSourceInput<Adapter>>,
): NormalizedProviderProfiles<Adapter> {
  const entries = isDirectInput(input) ? [["default", input] as const] : Object.entries(input);
  if (entries.length === 0)
    throw new TypeError(`${capability.id} provider profiles must not be empty`);
  const profiles: Record<string, NormalizedProviderSource<Adapter>> = {};
  for (const [name, source] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const profile = normalizeId(name);
    if (profiles[profile] !== undefined)
      throw new TypeError(`Duplicate ${capability.id} provider profile "${profile}"`);
    const normalized = normalizeProviderSource(source);
    if (normalized.adapter.capability.id !== capability.id)
      throw new TypeError(
        `${capability.id} provider profile "${profile}" received ${normalized.adapter.capability.id}.${normalized.adapter.adapterId}`,
      );
    profiles[profile] = normalized;
  }
  return frozen({
    kind: "normalized-provider-profiles",
    capability: capability.id,
    profiles,
  });
}

export function selectProviderProfile<Adapter extends ProviderAdapter>(
  normalized: NormalizedProviderProfiles<Adapter>,
  options: {
    readonly descriptorId: string;
    readonly profile?: string;
    readonly defaultProfile?: string;
  },
): ProviderProfileSelection<Adapter> {
  const profiles = Object.keys(normalized.profiles);
  const selected =
    options.profile ?? options.defaultProfile ?? (profiles.length === 1 ? profiles[0] : undefined);
  const source: ProviderProfileSelectionSource =
    options.profile !== undefined
      ? "descriptor"
      : options.defaultProfile !== undefined
        ? "default"
        : "sole";
  if (selected === undefined)
    throw new ProviderProfileSelectionError(
      "AMBIGUOUS_PROVIDER_PROFILE",
      normalized.capability,
      normalizeId(options.descriptorId),
      profiles,
      "requires an explicit profile",
    );
  const profile = normalizeId(selected);
  const binding = normalized.profiles[profile];
  if (binding === undefined)
    throw new ProviderProfileSelectionError(
      "UNKNOWN_PROVIDER_PROFILE",
      normalized.capability,
      normalizeId(options.descriptorId),
      profiles,
      `selected unknown profile "${profile}"`,
    );
  return frozen({ capability: normalized.capability, profile, source, binding });
}

function isDirectInput(value: unknown): value is ProviderSourceInput {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  return ["provider-adapter", "provider-local-source", "provider-infrastructure-source"].includes(
    value.kind,
  );
}

function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
