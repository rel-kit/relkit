import type { OperationId } from "@relkit/contracts";
import { Clock, Context, Effect, Layer, Result } from "effect";
import type { OperationIdEntropyService, ParseOperationIdOptions } from "./operation-id.types.js";
import { OperationIdFailure } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Compatibility error for invalid or expired operation IDs.
 * @example new OperationIdError("OPERATION_ID_INVALID", "Operation ID must be a UUIDv7.");
 */
export class OperationIdError extends TypeError {
  /** Constructs a legacy operation ID error.
   * @param code - Stable error code.
   * @param message - Human-readable failure reason.
   * @returns An OperationIdError.
   * @example new OperationIdError("OPERATION_ID_INVALID", "Invalid ID");
   */
  constructor(
    readonly code: "OPERATION_ID_INVALID" | "IDEMPOTENCY_WINDOW_EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "OperationIdError";
  }
}
/** Injectable random-byte service for operation ID generation.
 * @example Effect.provide(createOperationIdEffect(0), OperationIdEntropyLive);
 */
export class OperationIdEntropy extends Context.Service<
  OperationIdEntropy,
  OperationIdEntropyService
>()("relkit/realtime/OperationIdEntropy") {}
/** Cryptographic entropy for live UUIDv7 creation.
 * @example Effect.provide(createOperationIdEffect(0), OperationIdEntropyLive);
 */
export const OperationIdEntropyLive = Layer.succeed(OperationIdEntropy, {
  bytes: Effect.fn("Realtime.operationIdBytes")(function* () {
    return crypto.getRandomValues(new Uint8Array(16));
  }),
});
/** Extracts the first 48 timestamp bits without validating UUID syntax.
 * @param value - UUID-shaped string.
 * @returns An Effect of milliseconds or NaN for malformed input.
 * @example Effect.runSync(operationIdTimestampEffect(id));
 */
export const operationIdTimestampEffect = Effect.fn("Realtime.operationIdTimestamp")(
  function* (value: string) {
    return Number.parseInt(value.replaceAll("-", "").slice(0, 12), 16);
  },
  (effect) => observeRealtime("operationId.timestamp", effect),
);
/** Extracts a UUIDv7 timestamp without validating the ID.
 * @param value - UUID-shaped string.
 * @returns Timestamp in milliseconds, or NaN.
 * @example operationIdTimestamp(id);
 */
export function operationIdTimestamp(value: string): number {
  return Effect.runSync(operationIdTimestampEffect(value));
}
/** Parses a UUIDv7 operation ID and enforces its receipt window.
 * @param value - Candidate UUIDv7 string.
 * @param options - Optional deterministic clock and retention window.
 * @returns An Effect of a normalized ID or OperationIdFailure.
 * @example Effect.runSync(parseOperationIdEffect(id, { now: Date.now() }));
 */
export const parseOperationIdEffect = Effect.fn("Realtime.parseOperationId")(
  function* (value: string, options: ParseOperationIdOptions = {}) {
    if (!UUID_V7.test(value))
      return yield* Effect.fail(
        new OperationIdFailure({
          code: "OPERATION_ID_INVALID",
          reason: "Operation ID must be a UUIDv7.",
        }),
      );
    const timestamp = yield* operationIdTimestampEffect(value);
    const now = options.now ?? (yield* Clock.currentTimeMillis);
    if (timestamp > now + 5 * 60_000)
      return yield* Effect.fail(
        new OperationIdFailure({
          code: "OPERATION_ID_INVALID",
          reason: "Operation ID timestamp is in the future.",
        }),
      );
    if (timestamp < now - (options.receiptWindowMs ?? 24 * 60 * 60_000))
      return yield* Effect.fail(
        new OperationIdFailure({
          code: "IDEMPOTENCY_WINDOW_EXPIRED",
          reason: "Operation ID is outside the receipt retention window.",
        }),
      );
    return value.toLowerCase() as OperationId;
  },
  (effect) => observeRealtime("operationId.parse", effect),
);
/** Parses a UUIDv7 operation ID through the compatibility API.
 * @param value - Candidate UUIDv7 string.
 * @param options - Optional clock and receipt window.
 * @returns A normalized operation ID.
 * @throws OperationIdError for an invalid or expired ID.
 * @example parseOperationId(id, { now: Date.now() });
 */
export function parseOperationId(
  value: string,
  options: ParseOperationIdOptions = {},
): OperationId {
  const result = Effect.runSync(Effect.result(parseOperationIdEffect(value, options)));
  if (Result.isFailure(result))
    throw new OperationIdError(result.failure.code, result.failure.reason);
  return result.success;
}
/** Creates a UUIDv7 ID using Effect Clock and injectable entropy.
 * @param now - Optional explicit timestamp in milliseconds.
 * @returns An Effect of an ID or OperationIdFailure; requires OperationIdEntropy.
 * @example Effect.runSync(Effect.provide(createOperationIdEffect(0), OperationIdEntropyLive));
 */
export const createOperationIdEffect = Effect.fn("Realtime.createOperationId")(
  function* (now: number | undefined) {
    let timestamp = now ?? (yield* Clock.currentTimeMillis);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffffffff)
      return yield* Effect.fail(
        new OperationIdFailure({
          code: "OPERATION_ID_INVALID",
          reason: "UUIDv7 timestamp is out of range.",
        }),
      );
    const entropy = yield* OperationIdEntropy;
    const bytes = yield* entropy.bytes();
    if (bytes.length !== 16)
      return yield* Effect.fail(
        new OperationIdFailure({
          code: "OPERATION_ID_INVALID",
          reason: "UUIDv7 entropy must contain 16 bytes.",
        }),
      );
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = timestamp & 0xff;
      timestamp = Math.floor(timestamp / 256);
    }
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as OperationId;
  },
  (effect) => observeRealtime("operationId.create", effect),
);
/** Creates a UUIDv7 operation ID.
 * @param now - Optional timestamp in milliseconds.
 * @returns A UUIDv7 operation ID.
 * @throws RangeError for an invalid timestamp.
 * @example createOperationId(Date.now());
 */
export function createOperationId(now?: number): OperationId {
  const result = Effect.runSync(
    Effect.result(Effect.provide(createOperationIdEffect(now), OperationIdEntropyLive)),
  );
  if (Result.isFailure(result)) throw new RangeError(result.failure.reason);
  return result.success;
}
