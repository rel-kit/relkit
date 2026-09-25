import { deepFreeze, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { ProviderInputError } from "./provider-compat-errors.js";
import { providerSerializeJson } from "./protocol-builder-utils.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import {
  assertAdapter,
  assertConnected,
  isAdapter,
  isConfigured,
  isRecord,
  label,
} from "./source-validation.js";
import type {
  InfrastructureProviderSource,
  IntegrationReference,
  LocalProviderSource,
  NormalizedProviderSource,
  ProviderAccess,
  ProviderAdapter,
  ProviderBindingSource,
  ProviderSourceInput,
} from "./protocol.types.js";
/** Add an adapter's local recipe without starting it.
 * @param adapter - Adapter with a local recipe.
 * @returns An Effect with a frozen local source or a tagged validation error.
 * @example Effect.runSync(defineLocalProviderSourceEffect(adapter));
 */
export function defineLocalProviderSourceEffect<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
): Effect.Effect<LocalProviderSource<Adapter>, ProviderError> {
  return observeProvider(
    "source.local",
    providerCalculation("INVALID_DESCRIPTOR", () => defineLocalProviderSourceCore(adapter)),
  );
}
/** Add an adapter's local recipe for synchronous callers.
 * @param adapter - Adapter with a local recipe.
 * @returns A frozen local source.
 * @throws TypeError when the adapter is invalid or has no local recipe.
 * @example defineLocalProviderSource(adapter);
 */
export function defineLocalProviderSource<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
): LocalProviderSource<Adapter> {
  return runProvider(defineLocalProviderSourceEffect(adapter));
}
function defineLocalProviderSourceCore<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
): LocalProviderSource<Adapter> {
  assertAdapter(adapter);
  if (adapter.localRecipe === undefined)
    throw new ProviderInputError(`${label(adapter)} does not declare a local recipe`);
  return frozen({ kind: "provider-local-source", adapter }) as LocalProviderSource<Adapter>;
}
/** Add an infrastructure source in an Effect.
 * @param adapter - Adapter with a default local recipe.
 * @param integration - Infrastructure integration identity.
 * @param options - Infrastructure-specific options.
 * @param access - Optional access metadata.
 * @returns An Effect with a frozen source or tagged validation error.
 * @example Effect.runSync(defineInfrastructureProviderSourceEffect(adapter, integration, {}));
 */
export function defineInfrastructureProviderSourceEffect<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
  integration: IntegrationReference,
  options: JsonValue,
  access?: ProviderAccess,
): Effect.Effect<InfrastructureProviderSource<Adapter>, ProviderError> {
  return observeProvider(
    "source.infrastructure",
    providerCalculation("INVALID_DESCRIPTOR", () =>
      defineInfrastructureProviderSourceCore(adapter, integration, options, access),
    ),
  );
}
/** Add an infrastructure source synchronously.
 * @param adapter - Adapter with a default local recipe.
 * @param integration - Infrastructure integration identity.
 * @param options - Infrastructure-specific options.
 * @param access - Optional access metadata.
 * @returns A frozen infrastructure source.
 * @throws TypeError when the adapter is invalid or has no local recipe.
 * @example defineInfrastructureProviderSource(adapter, integration, {});
 */
export function defineInfrastructureProviderSource<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
  integration: IntegrationReference,
  options: JsonValue,
  access?: ProviderAccess,
): InfrastructureProviderSource<Adapter> {
  return runProvider(
    defineInfrastructureProviderSourceEffect(adapter, integration, options, access),
  );
}
function defineInfrastructureProviderSourceCore<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
  integration: IntegrationReference,
  options: JsonValue,
  access?: ProviderAccess,
): InfrastructureProviderSource<Adapter> {
  assertAdapter(adapter);
  if (adapter.localRecipe === undefined)
    throw new ProviderInputError(`${label(adapter)} does not declare a default local recipe`);
  return frozen({
    kind: "provider-infrastructure-source",
    adapter,
    integration,
    options,
    ...(access === undefined ? {} : { access }),
  }) as InfrastructureProviderSource<Adapter>;
}
/** Normalize any provider source in an Effect.
 * @param input - Direct adapter or source wrapper.
 * @returns An Effect with a frozen source or tagged validation error.
 * @example Effect.runSync(normalizeProviderSourceEffect(adapter));
 */
export function normalizeProviderSourceEffect<const Adapter extends ProviderAdapter>(
  input: ProviderSourceInput<Adapter>,
): Effect.Effect<NormalizedProviderSource<Adapter>, ProviderError> {
  return observeProvider(
    "source.normalize",
    providerCalculation("INVALID_DESCRIPTOR", () => normalizeProviderSourceCore(input)),
  );
}
/** Normalize a provider source synchronously.
 * @param input - Direct adapter or source wrapper.
 * @returns A frozen normalized source.
 * @throws TypeError for invalid descriptors, nested wrappers, or missing values.
 * @example normalizeProviderSource(adapter);
 */
export function normalizeProviderSource<const Adapter extends ProviderAdapter>(
  input: ProviderSourceInput<Adapter>,
): NormalizedProviderSource<Adapter> {
  return runProvider(normalizeProviderSourceEffect(input));
}
/** Pure normalization shared by observed source and profile operations.
 * @param input - Direct adapter or source wrapper.
 * @returns Frozen normalized source.
 * @throws TypeError for invalid descriptors or missing required values.
 * @example normalizeProviderSourceCore(adapter);
 */
export function normalizeProviderSourceCore<const Adapter extends ProviderAdapter>(
  input: ProviderSourceInput<Adapter>,
): NormalizedProviderSource<Adapter> {
  if (isRecord(input) && input.kind === "provider-adapter") {
    assertAdapter(input);
    assertConnected(input);
    return normalized(input, { kind: "connected" });
  }
  if (isRecord(input) && isRecord(input.adapter)) assertAdapter(input.adapter);
  if (!isRecord(input) || !isAdapter(input.adapter))
    throw new ProviderInputError("Provider source wrappers cannot be nested");
  if (input.kind === "provider-local-source") {
    const source: ProviderBindingSource = isConfigured(input.adapter)
      ? { kind: "connected" }
      : { kind: "local-only" };
    return normalized(input.adapter, source, input.adapter.localRecipe);
  }
  if (input.kind === "provider-infrastructure-source")
    return normalized(
      input.adapter,
      {
        kind: "infrastructure",
        integrationId: input.integration.integrationId,
        options: input.options,
      },
      input.adapter.localRecipe,
      input.access?.value,
    );
  throw new ProviderInputError("Invalid provider source descriptor");
}
function normalized<Adapter extends ProviderAdapter>(
  adapter: Adapter,
  source: ProviderBindingSource,
  local?: Adapter["localRecipe"],
  access?: JsonValue,
): NormalizedProviderSource<Adapter> {
  return frozen({
    kind: "normalized-provider-source",
    adapter,
    source,
    ...(local === undefined ? {} : { local }),
    ...(access === undefined ? {} : { access }),
  }) as NormalizedProviderSource<Adapter>;
}
function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(providerSerializeJson(value)) as Value);
}
