import { deepFreeze, isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { providerNormalizeId, providerSerializeJson } from "./protocol-builder-utils.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type { BindingValueRef, BindingValueType } from "./protocol.types.js";
const bindingValueTypes: readonly BindingValueType[] = [
  "string",
  "number",
  "boolean",
  "port",
  "url",
  "json",
  "secret-string",
];
/** Create a binding-local named value reference in an Effect.
 * @param name - Stable binding value name.
 * @param type - Expected value type.
 * @returns An Effect with a frozen reference or a tagged validation error.
 * @example Effect.runSync(createBindingValueRefEffect("CACHE_URL", "secret-string"));
 */
export function createBindingValueRefEffect<
  const Name extends string,
  Value = unknown,
  const Type extends BindingValueType = BindingValueType,
>(name: Name, type: Type): Effect.Effect<BindingValueRef<Name, Value, Type>, ProviderError> {
  return observeProvider(
    "binding-value.create",
    providerCalculation("INVALID_ID", () =>
      createBindingValueRefCore<Name, Value, Type>(name, type),
    ),
  );
}
/** Create a binding-local value reference synchronously.
 * @param name - Stable binding value name.
 * @param type - Expected value type.
 * @returns A frozen reference.
 * @throws TypeError for an invalid name.
 * @example createBindingValueRef("CACHE_URL", "secret-string");
 */
export function createBindingValueRef<
  const Name extends string,
  Value = unknown,
  const Type extends BindingValueType = BindingValueType,
>(name: Name, type: Type): BindingValueRef<Name, Value, Type> {
  return runProvider(createBindingValueRefEffect<Name, Value, Type>(name, type));
}
function createBindingValueRefCore<
  const Name extends string,
  Value = unknown,
  const Type extends BindingValueType = BindingValueType,
>(name: Name, type: Type): BindingValueRef<Name, Value, Type> {
  const normalized = providerNormalizeId(name) as unknown as Name;
  return frozen({
    kind: "binding-value-ref",
    name: normalized,
    type,
    sensitive: type === "secret-string",
  }) as BindingValueRef<Name, Value, Type>;
}
/** Check an exact binding-local reference in an Effect.
 * @param value - Candidate value.
 * @returns An Effect with a boolean and no expected failures.
 * @example Effect.runSync(isBindingValueRefEffect(value));
 */
export function isBindingValueRefEffect(value: unknown): Effect.Effect<boolean, ProviderError> {
  return observeProvider(
    "binding-value.is-ref",
    providerCalculation("INVALID_DESCRIPTOR", () => isBindingValueRefCore(value)),
  );
}
/** Check an exact binding-local reference synchronously.
 * @param value - Candidate value.
 * @returns True for an exact valid reference.
 * @example isBindingValueRef(value);
 */
export function isBindingValueRef(value: unknown): value is BindingValueRef {
  return runProvider(isBindingValueRefEffect(value));
}
/** Pure predicate shared by observed provider operations.
 * @param value - Candidate reference.
 * @returns True only for an exact binding-local reference.
 * @example isBindingValueRefCore({ kind: "binding-value-ref", name: "URL", type: "string", sensitive: false });
 */
export function isBindingValueRefCore(value: unknown): value is BindingValueRef {
  return (
    isRecord(value) &&
    Reflect.ownKeys(value).length === 4 &&
    value.kind === "binding-value-ref" &&
    isStableId(value.name) &&
    bindingValueTypes.includes(value.type as BindingValueType) &&
    value.sensitive === (value.type === "secret-string")
  );
}
function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(providerSerializeJson(value)) as Value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
