import { isSpanId, isTraceId, type SpanContext, type TracePropagation } from "./trace-context.js";

/** Invalid remote metadata is ignored rather than failing application work. */
export function parseTraceParent(value: unknown, traceState?: unknown): SpanContext | undefined {
  if (typeof value !== "string" || value.length < 55) return undefined;
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(.*)$/.exec(value);
  if (!match || match[0] !== value) return undefined;
  const [, version, traceId, spanId, flags, suffix] = match;
  if (version === "ff" || !isTraceId(traceId) || !isSpanId(spanId)) return undefined;
  if (version === "00" ? suffix !== "" : suffix !== "" && !suffix?.startsWith("-"))
    return undefined;
  const state = parseTraceState(traceState);
  return Object.freeze({
    traceId,
    spanId,
    traceFlags: Number.parseInt(flags!, 16) & 1,
    remote: true,
    ...(state === undefined ? {} : { traceState: state }),
  });
}

export function parseTraceState(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 512) return undefined;
  const entries = value.split(",");
  if (entries.length > 32) return undefined;
  const keys = new Set<string>();
  for (const entry of entries) {
    const match =
      /^[ \t]*([a-z][a-z0-9_*/-]{0,255}|[a-z0-9][a-z0-9_*/-]{0,240}@[a-z][a-z0-9_*/-]{0,13})=([\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e])[ \t]*$/.exec(
        entry,
      );
    if (!match || keys.has(match[1]!)) return undefined;
    keys.add(match[1]!);
  }
  return value.trim();
}

/** Writes only valid W3C context; never injects local request identifiers. */
export function injectTraceContext(headers: Headers, context: SpanContext): void {
  if (!isTraceId(context.traceId) || !isSpanId(context.spanId)) return;
  headers.set(
    "traceparent",
    `00-${context.traceId}-${context.spanId}-${(context.traceFlags & 1).toString(16).padStart(2, "0")}`,
  );
  headers.delete("tracestate");
  const state = parseTraceState(context.traceState);
  if (state !== undefined) headers.set("tracestate", state);
}

export function parseTracePropagation(value: unknown): TracePropagation | undefined {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const input = value as Partial<TracePropagation>;
    if (input.version !== 2 || !input.producer) return undefined;
    const { traceId, spanId, traceFlags, traceState } = input.producer;
    if (!isTraceId(traceId) || !isSpanId(spanId) || !Number.isInteger(traceFlags)) return undefined;
    if (traceFlags! < 0 || traceFlags! > 255) return undefined;
    const state = parseTraceState(traceState);
    const identities: Record<string, string> = {};
    for (const key of ["requestId", "originRequestId", "correlationId", "invocationId"] as const) {
      const id = input[key];
      if (
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= 256 &&
        !/[\x00-\x1f\x7f]/.test(id)
      )
        identities[key] = id;
    }
    return Object.freeze({
      version: 2,
      ...identities,
      producer: Object.freeze({
        traceId,
        spanId,
        traceFlags: traceFlags! & 1,
        remote: true,
        ...(state === undefined ? {} : { traceState: state }),
      }),
    });
  } catch {
    return undefined;
  }
}
