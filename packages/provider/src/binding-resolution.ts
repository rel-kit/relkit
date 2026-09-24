import { deepFreeze, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { providerNormalizeId, providerSerializeJson } from "./protocol-builder-utils.js";
import { isBindingValueRefCore } from "./binding-values.js";
import { ProviderBindingResolutionError } from "./provider-compat-errors.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type {
  ProviderConnectionDescriptor,
  ResolveProviderConnectionOptions,
} from "./binding-resolution.types.js";
import type { ProviderConnectionField } from "./protocol.types.js";
export { ProviderBindingResolutionError } from "./provider-compat-errors.js";
export type { ProviderBindingResolutionCode } from "./provider-errors.js";
export type {
  ProviderConnectionDescriptor,
  ResolveProviderConnectionOptions,
} from "./binding-resolution.types.js";
/** Resolve a provider's connection values in an Effect with tagged failures.
 * @param adapter - Adapter connection contract and authored values.
 * @param options - Binding profile and optional materialized values.
 * @returns An Effect with frozen connection values or a tagged provider error.
 * @example Effect.runSync(resolveProviderConnectionEffect(adapter, { profile: "default" }));
 */
export function resolveProviderConnectionEffect(
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): Effect.Effect<Readonly<Record<string, JsonValue>>, ProviderError> {
  return observeProvider(
    "binding.resolve",
    providerCalculation("INVALID_CONNECTION", () =>
      resolveProviderConnectionCore(adapter, options),
    ),
  );
}
/** Resolve provider connection values synchronously for legacy callers.
 * @param adapter - Adapter connection contract and authored values.
 * @param options - Binding profile and optional materialized values.
 * @returns Frozen resolved connection values.
 * @throws ProviderBindingResolutionError for missing or conflicting values; TypeError for invalid input.
 * @example resolveProviderConnection(adapter, { profile: "default" });
 */
export function resolveProviderConnection(
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): Readonly<Record<string, JsonValue>> {
  return runProvider(resolveProviderConnectionEffect(adapter, options));
}
function resolveProviderConnectionCore(
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): Readonly<Record<string, JsonValue>> {
  const bindingId =
    options.bindingId ?? `${adapter.capability.id}.${providerNormalizeId(options.profile)}`;
  assertDeclaredOutputs(bindingId, adapter, "local", options.local);
  assertDeclaredOutputs(bindingId, adapter, "infrastructure", options.infrastructure);
  const result: Record<string, JsonValue> = {};
  for (const [name, field] of Object.entries(adapter.connectionContract.fields)) {
    const resolved = resolveField(bindingId, name, field, adapter, options);
    if (resolved !== undefined) result[name] = resolved;
  }
  return deepFreeze(JSON.parse(providerSerializeJson(result)) as Record<string, JsonValue>);
}
function resolveField(
  bindingId: string,
  name: string,
  field: ProviderConnectionField,
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): JsonValue | undefined {
  const local = own(options.local, name);
  const infrastructure = own(options.infrastructure, name);
  const authored = own(adapter.connection, name);
  if ((local || infrastructure) && authored && field.authoredValue === "fixed")
    throw new ProviderBindingResolutionError(
      "CONFLICTING_CONNECTION_VALUE",
      bindingId,
      name,
      `conflicts with ${local ? "local" : "infrastructure"} output`,
    );
  if (local) return options.local![name];
  if (infrastructure) return options.infrastructure![name];
  if (authored) {
    const value = adapter.connection[name];
    if (!isBindingValueRefCore(value)) return value;
    if (own(options.values, value.name)) return options.values![value.name];
    if (own(field, "default")) return field.default;
    if (field.required)
      throw new ProviderBindingResolutionError(
        "MISSING_CONNECTION_VALUE",
        bindingId,
        name,
        `requires binding value "${value.name}"`,
      );
    return undefined;
  }
  if (own(field, "default")) return field.default;
  if (field.required)
    throw new ProviderBindingResolutionError(
      "MISSING_CONNECTION_VALUE",
      bindingId,
      name,
      "is required",
    );
  return undefined;
}
function assertDeclaredOutputs(
  bindingId: string,
  adapter: ProviderConnectionDescriptor,
  source: "local" | "infrastructure",
  outputs: Readonly<Record<string, JsonValue>> | undefined,
): void {
  if (outputs === undefined) return;
  for (const name of Object.keys(outputs))
    if (!own(adapter.connectionContract.fields, name))
      throw new ProviderBindingResolutionError(
        "UNKNOWN_CONNECTION_OUTPUT",
        bindingId,
        name,
        `is not declared for ${source} output`,
      );
}
function own(value: object | undefined, key: PropertyKey): boolean {
  return value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}
