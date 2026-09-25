import { deepFreeze, isStableId, serializeJsonEffect, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { LocalServiceValidationFailure } from "./local-service-errors.js";
import { observeLocalService, runLocalService } from "./local-service-observability.js";
import { checkVersionEffect } from "./protocol-version.js";
import { PROVIDER_OVERRIDE_STATE_VERSION } from "./protocol.js";
import type { ProviderOverrideExpectation, ProviderOverrideState } from "./protocol.types.js";
/** Report a malformed override artifact in the typed error channel. */
const invalidOverride = Effect.fn("LocalService.invalidOverride")(function* () {
  return yield* Effect.fail(
    new LocalServiceValidationFailure({
      message: "Provider-override state does not match the runtime activation.",
    }),
  );
});
/** Resolve only the overrides belonging to one activation.
 * @param value - Parsed override artifact.
 * @param expected - Expected activation identity.
 * @returns An Effect containing frozen binding values or a tagged validation/version failure.
 * @example Effect.runSync(providerOverrideBindingValuesEffect(artifact, expected));
 */
export const providerOverrideBindingValuesEffect = Effect.fn(
  "LocalService.providerOverrideBindingValues",
)(function* (value: unknown, expected: ProviderOverrideExpectation) {
  return yield* observeLocalService("override.binding-values", resolveOverrides(value, expected));
});
/** Validate activation identity before reading each binding; malformed JSON is a typed failure. */
const resolveOverrides = Effect.fn("LocalService.resolveOverrides")(function* (
  value: unknown,
  expected: ProviderOverrideExpectation,
) {
  // The version check is internal here so the public operation receives one metric sample.
  yield* checkVersionEffect(
    value,
    PROVIDER_OVERRIDE_STATE_VERSION,
    "Provider-override state",
    "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    "relkit local up",
  );
  const state = value as ProviderOverrideState;
  if (
    state.applicationId !== expected.applicationId ||
    state.planHash !== expected.planHash ||
    state.generationId !== expected.generationId ||
    !isStableId(state.applicationId) ||
    !isStableId(state.generationId) ||
    typeof state.localProjectId !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(state.localProjectId) ||
    typeof state.planHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(state.planHash) ||
    !Array.isArray(state.bindings)
  )
    return yield* invalidOverride();
  const bindings: Record<string, Readonly<Record<string, JsonValue>>> = {};
  for (const binding of state.bindings) {
    if (
      binding === null ||
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      !isStableId(binding.bindingId) ||
      binding.values === null ||
      typeof binding.values !== "object" ||
      Array.isArray(binding.values) ||
      Object.hasOwn(bindings, binding.bindingId) ||
      !Object.keys(binding.values).every(isStableId)
    )
      return yield* invalidOverride();
    yield* Effect.catchTag(serializeJsonEffect(binding.values), "JsonValueError", () =>
      invalidOverride(),
    );
    bindings[binding.bindingId] = binding.values as Readonly<Record<string, JsonValue>>;
  }
  return deepFreeze(bindings);
});
/** Resolve provider overrides synchronously for existing callers.
 * @param value - Parsed override artifact.
 * @param expected - Expected activation identity.
 * @returns Frozen values keyed by binding ID.
 * @throws LocalServiceVersionError or TypeError for an invalid artifact.
 * @example providerOverrideBindingValues(artifact, expected);
 */
export function providerOverrideBindingValues(
  value: unknown,
  expected: ProviderOverrideExpectation,
): Readonly<Record<string, Readonly<Record<string, JsonValue>>>> {
  return runLocalService(providerOverrideBindingValuesEffect(value, expected));
}
