/**
 * Canonical JSON text: object keys sorted at every depth, and only plain JSON data accepted.
 * Compilation serializes graphs, manifests and schemas of every descriptor, so the walk is a
 * hot path: the location of a value (`$["nodes"][3]`) is kept as a segment stack and spelled
 * out only when a value is rejected, and quoted keys are reused, so accepted data allocates
 * no path text. Rejections name the same location and reason as before.
 */
import { JsonValueError } from "./json-validation.js";

/** Quoted object keys; keys repeat across the nodes of one document and across documents. */
const quotedKeys = new Map<string, string>();

/** Location of the value being serialized, as array indexes and object keys below `$`. */
type Segments = (string | number)[];

/**
 * Serializes a value as canonical JSON.
 * @param value - Candidate JSON value.
 * @returns Canonical JSON text.
 * @throws JsonValueError naming the first rejected location.
 */
export function serializeCanonical(value: unknown): string {
  return serialize(value, [], new Set<object>());
}

function serialize(value: unknown, at: Segments, active: Set<object>): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);

  switch (typeof value) {
    case "undefined":
      throw rejected(at, "undefined is not JSON data");
    case "function":
      throw rejected(at, "functions are not JSON data");
    case "symbol":
      throw rejected(at, "symbols are not JSON data");
    case "bigint":
      throw rejected(at, "bigints are not JSON data");
    case "number":
      throw rejected(at, "non-finite numbers are not JSON data");
    case "object":
      return serializeObject(value, at, active);
    default:
      throw rejected(at, "value is not JSON data");
  }
}

function serializeObject(value: object, at: Segments, active: Set<object>): string {
  if (active.has(value)) throw rejected(at, "cycles are not JSON data");
  active.add(value);
  try {
    if (Array.isArray(value)) return serializeArray(value, at, active);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype)
      throw rejected(at, "only arrays and plain objects are JSON data");
    return serializeRecord(value, at, active);
  } finally {
    active.delete(value);
  }
}

function serializeArray(value: object[], at: Segments, active: Set<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype)
    throw rejected(at, "only ordinary arrays are JSON data");
  rejectSymbolKeys(value, at);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== "length" && !isArrayIndex(key, value.length))
      throw rejected(at, "array properties are not JSON data");
  }
  let text = "[";
  for (let index = 0; index < value.length; index += 1) {
    // An absent own property is a hole; one without a value is an accessor.
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    at.push(index);
    if (descriptor === undefined) throw rejected(at, "sparse arrays are not JSON data");
    if (!("value" in descriptor)) throw rejected(at, "accessor properties are not JSON data");
    text += `${index === 0 ? "" : ","}${serialize(descriptor.value, at, active)}`;
    at.pop();
  }
  return `${text}]`;
}

function serializeRecord(value: object, at: Segments, active: Set<object>): string {
  rejectSymbolKeys(value, at);
  const keys = Object.keys(value).sort();
  let text = "{";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    at.push(key);
    if (descriptor === undefined || !("value" in descriptor))
      throw rejected(at, "accessor properties are not JSON data");
    text += `${index === 0 ? "" : ","}${quoted(key)}:${serialize(descriptor.value, at, active)}`;
    at.pop();
  }
  return `${text}}`;
}

function quoted(key: string): string {
  let text = quotedKeys.get(key);
  if (text === undefined) {
    text = JSON.stringify(key);
    if (quotedKeys.size < 10_000) quotedKeys.set(key, text);
  }
  return text;
}

function rejectSymbolKeys(value: object, at: Segments): void {
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw rejected(at, "symbol keys are not JSON data");
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

/**
 * Builds the rejection for the current location.
 * @param at - Segments below `$`.
 * @param reason - Why the value is not JSON data.
 * @returns The error naming `$` followed by `[index]` and `["key"]` steps.
 */
function rejected(at: Segments, reason: string): JsonValueError {
  let path = "$";
  for (const segment of at)
    path += typeof segment === "number" ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  return new JsonValueError(path, reason);
}
