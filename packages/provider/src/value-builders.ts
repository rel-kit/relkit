import { Effect } from "effect";
import { ProviderInputError } from "./provider-compat-errors.js";
import type { JsonValue } from "@relkit/contracts";
import { frozen, stable } from "./protocol-builder-utils.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type {
  ProviderAccess,
  ProviderBehavior,
  ProviderConnectionContract,
  ProviderConnectionField,
  ProviderConnectionFieldInput,
} from "./protocol.types.js";
/** Define connection fields in an Effect with deterministic key order.
 * @param fields - Named authored connection fields.
 * @returns An Effect with a frozen contract or tagged validation error.
 * @example Effect.runSync(defineConnectionContractEffect({ url: { sensitive: true } }));
 */
export function defineConnectionContractEffect(
  fields: Readonly<Record<string, ProviderConnectionFieldInput>>,
): Effect.Effect<ProviderConnectionContract, ProviderError> {
  return observeProvider(
    "connection.define",
    providerCalculation("INVALID_CONNECTION", () => {
      const normalized: Record<string, ProviderConnectionField> = {};
      for (const [name, field] of Object.entries(fields).sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const key = stable(name);
        if (normalized[key] !== undefined)
          throw new ProviderInputError(`Duplicate connection field "${key}"`);
        normalized[key] = {
          required: field.required ?? true,
          sensitive: field.sensitive ?? false,
          authoredValue: field.authoredValue ?? "fixed",
          ...(field.default === undefined ? {} : { default: field.default }),
        };
      }
      return frozen({
        kind: "provider-connection-contract",
        fields: normalized,
      }) as ProviderConnectionContract;
    }),
  );
}
/** Define connection fields synchronously.
 * @param fields - Named authored connection fields.
 * @returns A frozen contract.
 * @throws TypeError for invalid or duplicate fields.
 * @example defineConnectionContract({ url: { sensitive: true } });
 */
export function defineConnectionContract(
  fields: Readonly<Record<string, ProviderConnectionFieldInput>>,
): ProviderConnectionContract {
  return runProvider(defineConnectionContractEffect(fields));
}
/** Define immutable provider behavior in an Effect.
 * @param value - Serializable behavior metadata.
 * @returns An Effect with frozen behavior or a tagged validation error.
 * @example Effect.runSync(defineProviderBehaviorEffect({ keyPrefix: "cart" }));
 */
export function defineProviderBehaviorEffect<const Value extends JsonValue>(
  value: Value,
): Effect.Effect<ProviderBehavior<Value>, ProviderError> {
  return observeProvider(
    "behavior.define",
    providerCalculation(
      "INVALID_DESCRIPTOR",
      () => frozen({ kind: "provider-behavior", value }) as ProviderBehavior<Value>,
    ),
  );
}
/** Define immutable provider behavior synchronously.
 * @param value - Serializable behavior metadata.
 * @returns Frozen behavior metadata.
 * @throws TypeError for invalid JSON.
 * @example defineProviderBehavior({ keyPrefix: "cart" });
 */
export function defineProviderBehavior<const Value extends JsonValue>(
  value: Value,
): ProviderBehavior<Value> {
  return runProvider(defineProviderBehaviorEffect(value));
}
/** Define immutable access metadata in an Effect.
 * @param value - Serializable access metadata.
 * @returns An Effect with frozen access or a tagged validation error.
 * @example Effect.runSync(defineProviderAccessEffect({ actions: ["cache:read"] }));
 */
export function defineProviderAccessEffect<const Value extends JsonValue>(
  value: Value,
): Effect.Effect<ProviderAccess<Value>, ProviderError> {
  return observeProvider(
    "access.define",
    providerCalculation(
      "INVALID_DESCRIPTOR",
      () => frozen({ kind: "provider-access", value }) as ProviderAccess<Value>,
    ),
  );
}
/** Define immutable access metadata synchronously.
 * @param value - Serializable access metadata.
 * @returns Frozen access metadata.
 * @throws TypeError for invalid JSON.
 * @example defineProviderAccess({ actions: ["cache:read"] });
 */
export function defineProviderAccess<const Value extends JsonValue>(
  value: Value,
): ProviderAccess<Value> {
  return runProvider(defineProviderAccessEffect(value));
}
