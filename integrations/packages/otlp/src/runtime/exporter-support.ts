import type { JsonPrimitive, JsonValue } from "@relkit/contracts";
import type { LogRecord, RedactedObservabilityRecord, SpanRecord } from "@relkit/observability";
import type { OtlpSignal } from "./transport.js";

export function otlpPayload(
  serviceName: string | undefined,
  records: readonly RedactedObservabilityRecord[],
  signal: OtlpSignal,
): JsonValue {
  return signal === "traces"
    ? {
        resourceSpans: records
          .filter(isCompletedSpan)
          .map((span) => resourceSpan(serviceName, span)),
      }
    : { resourceLogs: records.filter(isLog).map((log) => resourceLog(serviceName, log)) };
}

export function otlpSignalFor(record: RedactedObservabilityRecord): OtlpSignal | undefined {
  if (record.signal === "log") return "logs";
  return isCompletedSpan(record) ? "traces" : undefined;
}

export function otlpUnitId(record: RedactedObservabilityRecord, sequence: number): string {
  return record.traceId === undefined || record.signal === "log"
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

function resourceSpan(serviceName: string | undefined, span: SpanRecord): JsonValue {
  return {
    resource: {
      attributes: attributes({
        ...(serviceName === undefined ? {} : { "service.name": serviceName }),
        ...(span.serviceId === undefined ? {} : { "relkit.service.id": span.serviceId }),
        ...(span.generationId === undefined ? {} : { "relkit.generation.id": span.generationId }),
        ...(span.graphHash === undefined ? {} : { "relkit.graph.hash": span.graphHash }),
        ...span.resourceAttributes,
      }),
    },
    scopeSpans: [{ scope: { name: "relkit" }, spans: [spanValue(span)] }],
  };
}

function spanValue(span: SpanRecord): JsonValue {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
    name: span.name,
    kind: ({ internal: 1, server: 2, client: 3, producer: 4, consumer: 5 } as const)[span.kind],
    startTimeUnixNano: unixNanos(span.startedAt),
    endTimeUnixNano: unixNanos(span.completedAt ?? span.startedAt),
    attributes: attributes(span.attributes),
    events: (span.events ?? []).map((event) => ({
      name: event.name,
      timeUnixNano: unixNanos(event.timestamp),
      attributes: attributes(event.attributes),
      droppedAttributesCount: event.droppedAttributes ?? 0,
    })),
    links: (span.links ?? []).map((link) => ({
      traceId: link.traceId,
      spanId: link.spanId,
      attributes: attributes(link.attributes),
    })),
    status: status(span.outcome),
    droppedAttributesCount: span.dropped?.attributes ?? 0,
    droppedEventsCount: span.dropped?.events ?? 0,
  };
}

function resourceLog(serviceName: string | undefined, log: LogRecord): JsonValue {
  return {
    resource: {
      attributes: attributes({
        ...(serviceName === undefined ? {} : { "service.name": serviceName }),
        ...(log.serviceId === undefined ? {} : { "relkit.service.id": log.serviceId }),
        ...(log.generationId === undefined ? {} : { "relkit.generation.id": log.generationId }),
        ...(log.graphHash === undefined ? {} : { "relkit.graph.hash": log.graphHash }),
      }),
    },
    scopeLogs: [
      {
        scope: { name: "relkit" },
        logRecords: [
          {
            timeUnixNano: unixNanos(log.timestamp),
            severityNumber: (
              { trace: 1, debug: 5, info: 9, warn: 13, error: 17, fatal: 21 } as const
            )[log.level],
            severityText: log.level.toUpperCase(),
            body: { stringValue: log.message },
            attributes: attributes(log.fields),
            ...(log.traceId === undefined ? {} : { traceId: log.traceId }),
            ...(log.spanId === undefined ? {} : { spanId: log.spanId }),
          },
        ],
      },
    ],
  };
}

function attributes(
  values: Readonly<Record<string, JsonValue | JsonPrimitive>> | undefined,
): JsonValue[] {
  return Object.entries(values ?? {}).map(([key, value]) => ({ key, value: anyValue(value) }));
}

function anyValue(value: JsonValue): JsonValue {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  if (value === null) return { stringValue: "null" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(anyValue) } };
  return {
    kvlistValue: {
      values: Object.entries(value).map(([key, item]) => ({ key, value: anyValue(item) })),
    },
  };
}

function status(outcome: SpanRecord["outcome"]): JsonValue {
  if (outcome === undefined) return { code: 0 };
  return outcome === "success" ? { code: 1 } : { code: 2, message: outcome };
}

function unixNanos(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? String(BigInt(milliseconds) * 1_000_000n) : "0";
}

function isCompletedSpan(
  record: RedactedObservabilityRecord,
): record is SpanRecord & RedactedObservabilityRecord {
  return record.signal === "span" && record.status === "completed";
}

function isLog(
  record: RedactedObservabilityRecord,
): record is LogRecord & RedactedObservabilityRecord {
  return record.signal === "log";
}
