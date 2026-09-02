import { deepFreeze, isStableId, normalizeId, serializeJson } from "@relkit/contracts";
import type { BindingValueRef, BindingValueType } from "./protocol-types.js";

const bindingValueTypes: readonly BindingValueType[] = [
  "string",
  "number",
  "boolean",
  "port",
  "url",
  "json",
  "secret-string",
];

/**
 * Creates a named value reference scoped to one provider binding.
 *
 * @example
 * ```ts
 * import { createBindingValueRef } from "@relkit/provider";
 * const cacheUrl = createBindingValueRef("CACHE_URL", "secret-string");
 * ```
 * @category Provider protocol
 * @since 0.2.0
 */
export function createBindingValueRef<
  const Name extends string,
  Value = unknown,
  const Type extends BindingValueType = BindingValueType,
>(name: Name, type: Type): BindingValueRef<Name, Value, Type> {
  const normalized = normalizeId(name) as unknown as Name;
  return frozen({
    kind: "binding-value-ref",
    name: normalized,
    type,
    sensitive: type === "secret-string",
  }) as BindingValueRef<Name, Value, Type>;
}

/** Returns whether a value is an exact binding-local value reference. */
export function isBindingValueRef(value: unknown): value is BindingValueRef {
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
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
