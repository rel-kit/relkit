export interface TraceLimits {
  readonly spansPerTrace: number;
  readonly attributes: number;
  readonly events: number;
  readonly links: number;
  readonly updates: number;
  readonly attributeBytes: number;
  readonly activeSpans: number;
  readonly nameBytes: number;
  readonly keyBytes: number;
}

export const DEFAULT_TRACE_LIMITS: TraceLimits = Object.freeze({
  spansPerTrace: 512,
  attributes: 64,
  events: 32,
  links: 64,
  updates: 64,
  attributeBytes: 1024,
  activeSpans: 4096,
  nameBytes: 256,
  keyBytes: 128,
});

export function traceLimits(options: Partial<TraceLimits> = {}): TraceLimits {
  const limits = { ...DEFAULT_TRACE_LIMITS, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`Invalid trace limit: ${key}`);
  }
  return Object.freeze(limits);
}

const encoder = new TextEncoder();
export function boundedTraceText(value: string, bytes: number): string {
  const encoded = encoder.encode(value);
  if (encoded.length <= bytes) return value;
  let end = bytes;
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(encoded.subarray(0, end));
}

export function safeTraceAttribute(
  value: unknown,
  bytes: number,
): string | number | boolean | undefined {
  if (typeof value === "string") return boundedTraceText(value, bytes);
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
    return value;
  return undefined;
}

/** Reserved identities belong to runtime boundaries, not authored metadata. */
export function isReservedTraceKey(key: string): boolean {
  return (
    key.startsWith("relkit.") ||
    /^(?:traceId|spanId|parentSpanId|requestId|originRequestId|invocationId|correlationId)$/.test(
      key,
    )
  );
}
