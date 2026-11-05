/**
 * Wire constants and helpers the browser client shares with the backend, kept here so the
 * browser bundle never loads `relkit` runtime modules. `tests/compatibility/wire.test.ts`
 * checks that each value matches its `relkit/contracts` counterpart.
 */

/** Header that negotiates agent stream capabilities. */
export const AGENT_CAPABILITY_HEADER = "x-relkit-agent-capabilities";

/** Query parameter that carries agent stream capabilities where headers cannot. */
export const AGENT_CAPABILITY_QUERY = "relkitCapabilities";

/** The agent stream capabilities this client supports, comma separated. */
export const AGENT_CAPABILITY_VALUE = [
  "relkit.agent-stream.v2",
  "canonical-scoped-events.v1",
  "public-state.v1",
  "cursor-replay.v1",
  "native-checkpoints.v1",
].join(",");

/**
 * Serializes JSON data with object keys sorted, so equal values produce equal text. Like
 * `canonicalJson` in `relkit/contracts`, it accepts only JSON data: finite numbers, strings,
 * booleans, null, ordinary arrays and plain objects.
 * @param value - JSON data.
 * @returns The canonical JSON text.
 * @throws TypeError naming the path of the first value that is not JSON data.
 * @example canonicalJson({ b: 1, a: 2 }); // '{"a":2,"b":1}'
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, "$", new Set());
}

/**
 * Serializes one value.
 * @param value - Value at this path.
 * @param path - Path for error messages.
 * @param active - Objects on the current path, to reject cycles.
 * @returns The canonical JSON text.
 */
function serialize(value: unknown, path: string, active: Set<object>): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (typeof value !== "object") throw new TypeError(`${path}: ${typeof value} is not JSON data`);
  if (active.has(value)) throw new TypeError(`${path}: cycles are not JSON data`);
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError(`${path}: symbol keys are not JSON data`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype)
        throw new TypeError(`${path}: only ordinary arrays are JSON data`);
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index))
          throw new TypeError(`${path}[${index}]: sparse arrays are not JSON data`);
        items.push(serialize(value[index], `${path}[${index}]`, active));
      }
      return `[${items.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype)
      throw new TypeError(`${path}: only arrays and plain objects are JSON data`);
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor))
          throw new TypeError(`${path}.${key}: accessor properties are not JSON data`);
        return `${JSON.stringify(key)}:${serialize(descriptor.value, `${path}.${key}`, active)}`;
      });
    return `{${entries.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

/**
 * Creates a UUIDv7 operation ID from the current time and cryptographic randomness.
 * @param now - Milliseconds since the epoch; defaults to the current time.
 * @returns A lowercase UUIDv7 string.
 * @example createOperationId();
 */
export function createOperationId(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Math.max(0, Math.floor(now));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Development stream that announces backend contract changes; see `relkit/contracts`. */
export const CLIENT_CONTRACT_EVENTS_PATH = "/_relkit/v1/client/contract-events";

/** Router key under which the API tree lives; matches `CLIENT_API_ROOT` in `relkit/contracts`. */
export const API_ROOT_KEY = "api";

/** Backend path of the client routes document; matches `relkit/contracts`. */
export const CLIENT_ROUTES_PATH = "/_relkit/v1/client/routes";
