import type { JsonValue } from "@relkit/contracts";
import type { RedactedObservabilityRecord } from "@relkit/observability";
import type { OtlpSignal } from "./transport.js";

export function otlpPayload(
  serviceName: string | undefined,
  records: readonly RedactedObservabilityRecord[],
): JsonValue {
  return {
    ...(serviceName === undefined ? {} : { service: { name: serviceName } }),
    records: records as unknown as JsonValue,
  };
}

export function otlpSignalFor(record: RedactedObservabilityRecord): OtlpSignal {
  return record.signal === "log" || record.signal === "diagnostic" || record.signal === "generation"
    ? "logs"
    : "traces";
}

export function otlpUnitId(record: RedactedObservabilityRecord, sequence: number): string {
  return record.traceId === undefined || otlpSignalFor(record) === "logs"
    ? `${record.signal}:${sequence}`
    : `trace:${record.traceId}`;
}

export function combinedSignal(first: AbortSignal, second: AbortSignal | undefined): AbortSignal {
  return second === undefined ? first : AbortSignal.any([first, second]);
}

export async function within(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const timeout = nonNegative(timeoutMs, "timeoutMs");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeout);
  });
  const completed = operation.then(
    () => true as const,
    () => false as const,
  );
  const result = await Promise.race([completed, expired]);
  if (timer !== undefined) clearTimeout(timer);
  return result;
}

export function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`OTLP ${name} must be non-empty text`);
  return value.trim();
}

export function textMap(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("OTLP headers are invalid");
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [name, text(entry, `header ${name}`)]),
  );
}

export function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`OTLP ${name} is invalid`);
  return value;
}

export function nonNegative(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`OTLP ${name} is invalid`);
  return value;
}
