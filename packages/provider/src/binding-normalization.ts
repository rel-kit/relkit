import { deepFreeze, normalizeId, serializeJson } from "@relkit/contracts";
import type { ProviderProfileSelection } from "./profile-normalization.js";
import type { NormalizedProviderBinding, ProviderAdapter } from "./protocol-types.js";

export class ProviderFeatureMismatchError extends TypeError {
  readonly code = "MISSING_PROVIDER_FEATURE" as const;
  readonly capability: string;
  readonly profile: string;
  readonly descriptorId: string;
  readonly features: readonly string[];

  constructor(
    capability: string,
    profile: string,
    descriptorId: string,
    features: readonly string[],
  ) {
    super(
      `${capability} logical descriptor "${descriptorId}" requires missing features from profile "${profile}": ${features.join(", ")}`,
    );
    this.name = "ProviderFeatureMismatchError";
    this.capability = capability;
    this.profile = profile;
    this.descriptorId = descriptorId;
    this.features = features;
  }
}

export function normalizeProviderBinding(
  selection: ProviderProfileSelection,
  options: {
    readonly descriptorId: string;
    readonly requiredFeatures?: readonly string[];
  },
): NormalizedProviderBinding {
  const adapter = selection.binding.adapter;
  const supported = new Set(adapter.features.map((feature) => feature.id));
  const required = [...new Set((options.requiredFeatures ?? []).map(normalizeId))].sort();
  const missing = required.filter((feature) => !supported.has(feature));
  if (missing.length > 0)
    throw new ProviderFeatureMismatchError(
      selection.capability,
      selection.profile,
      normalizeId(options.descriptorId),
      missing,
    );
  return frozen({
    kind: "provider-binding",
    capability: selection.capability,
    profile: selection.profile,
    adapter: projectAdapter(adapter),
    source: selection.binding.source,
    ...(selection.binding.local === undefined ? {} : { local: selection.binding.local }),
    ...(selection.binding.access === undefined ? {} : { access: selection.binding.access }),
  }) as NormalizedProviderBinding;
}

function projectAdapter(adapter: ProviderAdapter): NormalizedProviderBinding["adapter"] {
  return {
    integrationId: adapter.integration.integrationId,
    adapterId: adapter.adapterId,
    protocolVersion: adapter.protocolVersion,
    behavior: adapter.behavior.value,
    connectionContract: adapter.connectionContract.fields,
    connection: adapter.connection,
    features: adapter.features.map((feature) => feature.id),
  };
}

function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}
