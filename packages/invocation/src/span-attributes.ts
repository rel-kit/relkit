import { boundedTraceText, safeTraceAttribute } from "./trace-limits.js";
import type { TraceLimits } from "./trace-limits.js";

/** Adds one scalar attribute inside an observed span operation.
 * @param attributes - Mutable span attributes. @param key - Candidate key.
 * @param value - Candidate value. @param limits - Attribute budgets.
 * @returns Whether the candidate was recorded.
 * @example setSpanAttribute(span.attributes, "status", 200, runtime.limits);
 */
export function setSpanAttribute(
  attributes: Map<string, string | number | boolean>,
  key: string,
  value: unknown,
  limits: TraceLimits,
): boolean {
  const scalar = safeTraceAttribute(value, limits.attributeBytes);
  if (
    !key ||
    boundedTraceText(key, limits.keyBytes) !== key ||
    scalar === undefined ||
    (!attributes.has(key) && attributes.size >= limits.attributes)
  )
    return false;
  attributes.set(key, scalar);
  return true;
}

/** Copies safe own data properties inside an observed span operation.
 * @param input - Untrusted metadata. @param limits - Attribute budgets.
 * @returns Frozen scalar attributes and the dropped attribute count.
 * @example spanMetadata({ status: 200 }, runtime.limits);
 */
export function spanMetadata(input: Readonly<Record<string, unknown>>, limits: TraceLimits) {
  const attributes: Record<string, string | number | boolean> = Object.create(null);
  let dropped = 0;
  let count = 0;
  for (const key of Object.keys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    const value =
      descriptor && "value" in descriptor
        ? safeTraceAttribute(descriptor.value, limits.attributeBytes)
        : undefined;
    if (
      !key ||
      boundedTraceText(key, limits.keyBytes) !== key ||
      value === undefined ||
      count >= limits.attributes
    ) {
      dropped++;
      continue;
    }
    attributes[key] = value;
    count++;
  }
  return { attributes: Object.freeze(attributes), dropped };
}
