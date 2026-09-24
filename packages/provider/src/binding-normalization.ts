import { deepFreeze } from "@relkit/contracts";
import { Effect } from "effect";
import { providerNormalizeId, providerSerializeJson } from "./protocol-builder-utils.js";
import { ProviderFeatureMismatchError } from "./provider-compat-errors.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type { NormalizeProviderBindingOptions } from "./binding-normalization.types.js";
import type { ProviderProfileSelection } from "./profile-normalization.types.js";
import type { NormalizedProviderBinding, ProviderAdapter } from "./protocol.types.js";
export { ProviderFeatureMismatchError } from "./provider-compat-errors.js";
export type { NormalizeProviderBindingOptions } from "./binding-normalization.types.js";
/** Normalize a selected binding in an Effect after checking features.
 * @param selection - Selected profile and adapter.
 * @param options - Logical descriptor and required feature names.
 * @returns An Effect with a frozen binding or a tagged feature failure.
 * @example Effect.runSync(normalizeProviderBindingEffect(selection, { descriptorId: "cart" }));
 */
export function normalizeProviderBindingEffect(
  selection: ProviderProfileSelection,
  options: NormalizeProviderBindingOptions,
): Effect.Effect<NormalizedProviderBinding, ProviderError> {
  return observeProvider(
    "binding.normalize",
    providerCalculation("INVALID_DESCRIPTOR", () =>
      normalizeProviderBindingCore(selection, options),
    ),
  );
}
/** Normalize a selected binding for synchronous callers.
 * @param selection - Selected profile and adapter.
 * @param options - Logical descriptor and required feature names.
 * @returns A frozen normalized binding.
 * @throws ProviderFeatureMismatchError when required features are absent.
 * @example normalizeProviderBinding(selection, { descriptorId: "cart" });
 */
export function normalizeProviderBinding(
  selection: ProviderProfileSelection,
  options: NormalizeProviderBindingOptions,
): NormalizedProviderBinding {
  return runProvider(normalizeProviderBindingEffect(selection, options));
}
function normalizeProviderBindingCore(
  selection: ProviderProfileSelection,
  options: NormalizeProviderBindingOptions,
): NormalizedProviderBinding {
  const adapter = selection.binding.adapter;
  const supported = new Set(adapter.features.map((feature) => feature.id));
  const required = [...new Set((options.requiredFeatures ?? []).map(providerNormalizeId))].sort();
  const missing = required.filter((feature) => !supported.has(feature));
  if (missing.length > 0)
    throw new ProviderFeatureMismatchError(
      selection.capability,
      selection.profile,
      providerNormalizeId(options.descriptorId),
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
  return deepFreeze(JSON.parse(providerSerializeJson(value)) as Value);
}
