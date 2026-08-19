/** A value or a promise of that value. */
export type MaybePromise<T> = T | Promise<T>;

/** Values represented directly by JSON. Non-finite numbers are rejected at runtime. */
export type JsonPrimitive = string | number | boolean | null;

/** A recursively JSON-serializable value. */
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Raised when a value cannot cross the JSON boundary. */
export class JsonValueError extends TypeError {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Invalid JSON value at ${path}: ${reason}`);
    this.name = "JsonValueError";
    this.path = path;
  }
}

/** Returns whether a value is a JSON primitive accepted by ZSys. */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** Returns whether a value is recursively JSON-safe. */
export function isJsonValue(value: unknown): value is JsonValue {
  try {
    serializeJson(value);
    return true;
  } catch {
    return false;
  }
}

/** Asserts that a value is recursively JSON-safe. */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  serializeJson(value);
}

/**
 * Serializes JSON deterministically by sorting every object key at every depth.
 * Undefined values, executable values, cycles, and non-JSON objects are errors.
 */
export function serializeJson(value: unknown): string {
  return serialize(value, "$", new Set<object>());
}

/** Alias for the one canonical JSON serializer. */
export const canonicalJson = serializeJson;

function serialize(value: unknown, path: string, active: Set<object>): string {
  if (isJsonPrimitive(value)) return JSON.stringify(value);

  switch (typeof value) {
    case "undefined":
      throw new JsonValueError(path, "undefined is not JSON data");
    case "function":
      throw new JsonValueError(path, "functions are not JSON data");
    case "symbol":
      throw new JsonValueError(path, "symbols are not JSON data");
    case "bigint":
      throw new JsonValueError(path, "bigints are not JSON data");
    case "number":
      throw new JsonValueError(path, "non-finite numbers are not JSON data");
    case "object":
      return serializeObject(value, path, active);
    default:
      throw new JsonValueError(path, "value is not JSON data");
  }
}

function serializeObject(value: object, path: string, active: Set<object>): string {
  if (active.has(value)) throw new JsonValueError(path, "cycles are not JSON data");
  active.add(value);

  try {
    if (Array.isArray(value)) return serializeArray(value, path, active);
    if (!isPlainObject(value)) {
      throw new JsonValueError(path, "only arrays and plain objects are JSON data");
    }
    return serializeRecord(value, path, active);
  } finally {
    active.delete(value);
  }
}

function serializeArray(value: object[], path: string, active: Set<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new JsonValueError(path, "only ordinary arrays are JSON data");
  }
  rejectSymbolKeys(value, path);

  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== "length" && !isArrayIndex(key, value.length)) {
      throw new JsonValueError(path, "array properties are not JSON data");
    }
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new JsonValueError(`${path}[${index}]`, "sparse arrays are not JSON data");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      throw new JsonValueError(`${path}[${index}]`, "accessor properties are not JSON data");
    }
    items.push(serialize(descriptor.value, `${path}[${index}]`, active));
  }
  return `[${items.join(",")}]`;
}

function serializeRecord(value: object, path: string, active: Set<object>): string {
  rejectSymbolKeys(value, path);
  const keys = Object.keys(value).sort();
  const entries: string[] = [];

  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new JsonValueError(
        `${path}[${JSON.stringify(key)}]`,
        "accessor properties are not JSON data",
      );
    }
    entries.push(
      `${JSON.stringify(key)}:${serialize(descriptor.value, `${path}[${JSON.stringify(key)}]`, active)}`,
    );
  }
  return `{${entries.join(",")}}`;
}

function rejectSymbolKeys(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new JsonValueError(path, "symbol keys are not JSON data");
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
