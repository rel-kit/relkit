import { deepFreeze } from "@relkit/contracts";
import { Effect } from "effect";
import { ProviderInputError } from "./provider-compat-errors.js";
import { providerNormalizeId, providerSerializeJson } from "./protocol-builder-utils.js";
import { normalizeProviderSourceCore } from "./source-normalization.js";
import { ProviderProfileSelectionError } from "./provider-compat-errors.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type {
  NormalizedProviderProfiles,
  ProviderInput,
  ProviderProfileSelection,
  ProviderProfileSelectionSource,
  SelectProviderProfileOptions,
} from "./profile-normalization.types.js";
import type {
  NormalizedProviderSource,
  ProviderAdapter,
  ProviderCapability,
  ProviderSourceInput,
} from "./protocol.types.js";
export { ProviderProfileSelectionError } from "./provider-compat-errors.js";
export type {
  NormalizedProviderProfiles,
  ProviderInput,
  ProviderProfileSelection,
  ProviderProfileSelectionSource,
  SelectProviderProfileOptions,
} from "./profile-normalization.types.js";
/** Normalize a direct source or named profile map in an Effect.
 * @param capability - Required provider capability.
 * @param input - Direct source or profile map.
 * @returns An Effect with sorted frozen profiles or a tagged provider error.
 * @example Effect.runSync(normalizeProviderProfilesEffect(cache, adapter));
 */
export function normalizeProviderProfilesEffect<Adapter extends ProviderAdapter>(
  capability: ProviderCapability,
  input: ProviderInput<ProviderSourceInput<Adapter>>,
): Effect.Effect<NormalizedProviderProfiles<Adapter>, ProviderError> {
  return observeProvider(
    "profile.normalize",
    providerCalculation("INVALID_PROFILE", () => normalizeProviderProfilesCore(capability, input)),
  );
}
/** Normalize provider profiles for synchronous callers.
 * @param capability - Required provider capability.
 * @param input - Direct source or profile map.
 * @returns Sorted frozen profiles.
 * @throws TypeError when a profile is empty, duplicated, or mismatched.
 * @example normalizeProviderProfiles(cache, adapter);
 */
export function normalizeProviderProfiles<Adapter extends ProviderAdapter>(
  capability: ProviderCapability,
  input: ProviderInput<ProviderSourceInput<Adapter>>,
): NormalizedProviderProfiles<Adapter> {
  return runProvider(normalizeProviderProfilesEffect(capability, input));
}
function normalizeProviderProfilesCore<Adapter extends ProviderAdapter>(
  capability: ProviderCapability,
  input: ProviderInput<ProviderSourceInput<Adapter>>,
): NormalizedProviderProfiles<Adapter> {
  const entries = isDirectInput(input) ? [["default", input] as const] : Object.entries(input);
  if (entries.length === 0)
    throw new ProviderInputError(`${capability.id} provider profiles must not be empty`);
  const profiles: Record<string, NormalizedProviderSource<Adapter>> = {};
  for (const [name, source] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const profile = providerNormalizeId(name);
    if (profiles[profile] !== undefined)
      throw new ProviderInputError(`Duplicate ${capability.id} provider profile "${profile}"`);
    const normalized = normalizeProviderSourceCore(source);
    if (normalized.adapter.capability.id !== capability.id)
      throw new ProviderInputError(
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
/** Select a descriptor, default, or sole provider profile in an Effect.
 * @param normalized - Available normalized profiles.
 * @param options - Descriptor choice and optional default.
 * @returns An Effect with the selected binding or a tagged selection error.
 * @example Effect.runSync(selectProviderProfileEffect(profiles, { descriptorId: "cart" }));
 */
export function selectProviderProfileEffect<Adapter extends ProviderAdapter>(
  normalized: NormalizedProviderProfiles<Adapter>,
  options: SelectProviderProfileOptions,
): Effect.Effect<ProviderProfileSelection<Adapter>, ProviderError> {
  return observeProvider(
    "profile.select",
    providerCalculation("INVALID_PROFILE", () => selectProviderProfileCore(normalized, options)),
  );
}
/** Select a provider profile synchronously for legacy callers.
 * @param normalized - Available normalized profiles.
 * @param options - Descriptor choice and optional default.
 * @returns The selected profile and binding.
 * @throws ProviderProfileSelectionError for ambiguity or an unknown profile.
 * @example selectProviderProfile(profiles, { descriptorId: "cart" });
 */
export function selectProviderProfile<Adapter extends ProviderAdapter>(
  normalized: NormalizedProviderProfiles<Adapter>,
  options: SelectProviderProfileOptions,
): ProviderProfileSelection<Adapter> {
  return runProvider(selectProviderProfileEffect(normalized, options));
}
function selectProviderProfileCore<Adapter extends ProviderAdapter>(
  normalized: NormalizedProviderProfiles<Adapter>,
  options: SelectProviderProfileOptions,
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
      providerNormalizeId(options.descriptorId),
      profiles,
      "requires an explicit profile",
    );
  const profile = providerNormalizeId(selected);
  const binding = normalized.profiles[profile];
  if (binding === undefined)
    throw new ProviderProfileSelectionError(
      "UNKNOWN_PROVIDER_PROFILE",
      normalized.capability,
      providerNormalizeId(options.descriptorId),
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
  return deepFreeze(JSON.parse(providerSerializeJson(value)) as Value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
