import type { OperationId } from "@relkit/contracts";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OperationIdError extends TypeError {
  constructor(
    readonly code: "OPERATION_ID_INVALID" | "IDEMPOTENCY_WINDOW_EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "OperationIdError";
  }
}

export function parseOperationId(
  value: string,
  options: { readonly now?: number; readonly receiptWindowMs?: number } = {},
): OperationId {
  if (!UUID_V7.test(value)) {
    throw new OperationIdError("OPERATION_ID_INVALID", "Operation ID must be a UUIDv7.");
  }
  const timestamp = operationIdTimestamp(value);
  const now = options.now ?? Date.now();
  if (timestamp > now + 5 * 60_000) {
    throw new OperationIdError("OPERATION_ID_INVALID", "Operation ID timestamp is in the future.");
  }
  if (timestamp < now - (options.receiptWindowMs ?? 24 * 60 * 60_000)) {
    throw new OperationIdError(
      "IDEMPOTENCY_WINDOW_EXPIRED",
      "Operation ID is outside the receipt retention window.",
    );
  }
  return value.toLowerCase() as OperationId;
}

export function operationIdTimestamp(value: string): number {
  return Number.parseInt(value.replaceAll("-", "").slice(0, 12), 16);
}

export function createOperationId(now = Date.now()): OperationId {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new RangeError("UUIDv7 timestamp is out of range.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = now & 0xff;
    now = Math.floor(now / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as OperationId;
}
