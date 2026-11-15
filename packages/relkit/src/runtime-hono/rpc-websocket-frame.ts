/** Recognizes a WebSocket frame that the oRPC peer protocol can decode, so that a malformed
 * frame closes the socket as invalid data (1007) instead of as a server failure (1011).
 */

/** Separates the JSON part of a binary frame from its attached bytes. */
const JSON_AND_BINARY_DELIMITER = 255;
/** oRPC peer message types: request, response, event iterator, abort signal. */
const MESSAGE_TYPES = new Set([1, 2, 3, 4]);

/**
 * Whether a frame is an oRPC peer request message: JSON, optionally followed by bytes in a binary
 * frame, holding an id, a known type and, for a request, a payload with its URL.
 * @param data - Frame as the runtime delivered it.
 * @returns True when the peer protocol can decode the frame.
 * @example isRpcFrame('{"i":"1","p":{"u":"/relkit.realtime.subscribe"}}'); // true
 */
export function isRpcFrame(data: unknown): boolean {
  // A Blob is read asynchronously by the handler; its decoding failures stay transport failures.
  if (typeof Blob !== "undefined" && data instanceof Blob) return true;
  const message = frameJson(data);
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const { i: id, t: type, p: payload } = message as Record<string, unknown>;
  if (typeof id !== "string" && typeof id !== "number") return false;
  if (type !== undefined && !MESSAGE_TYPES.has(type as number)) return false;
  if (type === 3) return typeof payload === "object" && payload !== null;
  if (type === 4 || type === 2) return true;
  if (typeof payload !== "object" || payload === null) return false;
  const url = (payload as Record<string, unknown>).u;
  return typeof url === "string" && URL.canParse(url, "orpc://localhost");
}

/**
 * Parses the JSON part of a text or binary frame.
 * @param data - Frame as the runtime delivered it.
 * @returns The parsed value, or undefined when the frame holds no valid JSON.
 */
function frameJson(data: unknown): unknown {
  try {
    if (typeof data === "string") return JSON.parse(data);
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : undefined;
    if (bytes === undefined) return undefined;
    const end = bytes.indexOf(JSON_AND_BINARY_DELIMITER);
    return JSON.parse(new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end)));
  } catch {
    return undefined;
  }
}
