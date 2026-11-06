/**
 * Reuses attributed metric instances. `Metric.withAttributes` returns a new metric on every
 * call, and each new instance serializes its attribute set into a registry key on its first
 * update; observers that tag every operation with the same few attribute sets would pay that
 * serialization on every operation. One instance per metric and attribute set computes its
 * key once and records the same series.
 */
import { Metric } from "effect";

const instances = new WeakMap<object, Map<string, unknown>>();

/**
 * Returns the metric tagged with the given attributes, reusing an earlier instance.
 * @param metric - Untagged metric.
 * @param attributes - Attribute names and string values.
 * @returns The same instance for the same metric and attribute values.
 */
export function attributedMetric<Input, State>(
  metric: Metric.Metric<Input, State>,
  attributes: Readonly<Record<string, string>>,
): Metric.Metric<Input, State> {
  const byKey = instances.get(metric) ?? new Map<string, unknown>();
  instances.set(metric, byKey);
  let key = "";
  for (const name in attributes) key += `${name}\u0000${attributes[name]}\u0000`;
  const known = byKey.get(key) as Metric.Metric<Input, State> | undefined;
  if (known !== undefined) return known;
  const tagged = Metric.withAttributes(metric, attributes);
  byKey.set(key, tagged);
  return tagged;
}
