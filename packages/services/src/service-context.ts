export function freezeServiceContextValue(value: unknown, seen: WeakMap<object, object>): unknown {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(freezeServiceContextValue(item, seen));
    return Object.freeze(copy);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) {
    copy[key] = freezeServiceContextValue(child, seen);
  }
  return Object.freeze(copy);
}
