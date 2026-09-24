import {
  deepFreeze,
  JsonValueError,
  normalizeId,
  serializeJson,
  StableIdError,
} from "@relkit/contracts";
import { ProviderInputError } from "./provider-compat-errors.js";
/** Normalize an ID while marking only contract validation failures as expected.
 * @param value - Candidate identifier.
 * @returns The normalized stable identifier.
 * @throws ProviderInputError for invalid identifiers; unexpected exceptions remain defects.
 * @example providerNormalizeId("cache");
 */
export function providerNormalizeId(value: unknown): ReturnType<typeof normalizeId> {
  try {
    return normalizeId(value);
  } catch (cause) {
    if (cause instanceof StableIdError) throw new ProviderInputError(cause.message);
    throw cause;
  }
}
/** Serialize JSON while marking only contract validation failures as expected.
 * @param value - Candidate JSON value.
 * @returns Canonical JSON text.
 * @throws ProviderInputError for invalid JSON; unexpected exceptions remain defects.
 * @example providerSerializeJson({ id: "cache" });
 */
export function providerSerializeJson(value: unknown): string {
  try {
    return serializeJson(value);
  } catch (cause) {
    if (cause instanceof JsonValueError) throw new ProviderInputError(cause.message);
    throw cause;
  }
}
/** Normalize an identifier while preserving its literal type in builder results.
 * @param value - Identifier to normalize.
 * @returns The normalized identifier.
 * @throws TypeError for an invalid identifier.
 * @example stable("cache");
 */
export function stable<const Value extends string>(value: Value): Value {
  return providerNormalizeId(value) as unknown as Value;
}
/** Detach and deeply freeze serializable provider metadata.
 * @param value - JSON-compatible value to detach.
 * @returns An immutable copy.
 * @throws TypeError for non-JSON values.
 * @example frozen({ kind: "provider-capability", id: "cache" });
 */
export function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(providerSerializeJson(value)) as Value);
}
