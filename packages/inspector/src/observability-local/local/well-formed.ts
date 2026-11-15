/**
 * Makes record text storable. A JavaScript string can hold an unpaired UTF-16 surrogate (a JSON
 * body may escape `\ud800`, and `JSON.parse` keeps it), but DuckDB's JSON column refuses such text
 * and with it the whole batch. Each unpaired surrogate becomes U+FFFD, as a UTF-8 encoder writes it.
 */

const UNPAIRED = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Replaces unpaired surrogates in every string of a JSON-like value, object keys included.
 * @param value - A record or any part of one.
 * @returns The same value when nothing needed replacing, otherwise a copy with U+FFFD in place of
 *   each unpaired surrogate.
 */
export function wellFormedValue<Value>(value: Value): Value {
  return replace(value) as Value;
}

/** Walks arrays and plain objects; other values are returned as they are. */
function replace(value: unknown): unknown {
  if (typeof value === "string") return value.replace(UNPAIRED, "�");
  if (Array.isArray(value)) {
    const items = value.map(replace);
    return items.every((item, index) => item === value[index]) ? value : items;
  }
  if (value === null || typeof value !== "object") return value;
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const next = [replace(key) as string, replace(item)] as const;
    if (next[0] !== key || next[1] !== item) changed = true;
    return next;
  });
  return changed ? Object.fromEntries(entries) : value;
}
