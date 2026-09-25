import type { EnvMetadata, EnvValueType, LiteralValue } from "./env.types.js";

/** Build initial immutable metadata inside the observed builder creation.
 * @param type - Declared field type.
 * @param sensitive - Whether source values require redaction.
 * @param values - Optional literal choices.
 * @returns Frozen metadata with no default or optional state.
 * @example metadata("string", false);
 */
export function metadata(
  type: EnvValueType,
  sensitive: boolean,
  values?: readonly LiteralValue[],
): EnvMetadata {
  return freezeMetadata({
    type,
    requiredIn: [],
    hasDefault: false,
    optional: false,
    sensitive,
    ...(values ? { values } : {}),
  });
}

/** Copy metadata inside an observed fluent builder operation.
 * @param value - Existing metadata.
 * @param changes - Fields to replace.
 * @returns Frozen copy of the metadata.
 * @example updateMetadata(env.string().metadata, { optional: true });
 */
export function updateMetadata(value: EnvMetadata, changes: Record<string, unknown>): EnvMetadata {
  return freezeMetadata({ ...value, ...changes } as EnvMetadata);
}

function freezeMetadata(value: EnvMetadata): EnvMetadata {
  return Object.freeze({
    ...value,
    requiredIn: Object.freeze([...value.requiredIn]),
    ...(value.values ? { values: Object.freeze([...value.values]) } : {}),
  });
}
