import { Cause } from "effect";
import type { JsonValue } from "@relkit/contracts";

export function redactCause(cause: Cause.Cause<unknown>): JsonValue {
  return {
    reasons: cause.reasons.map((reason) =>
      Cause.isFailReason(reason)
        ? { kind: "failure", detail: redactFailureDetail(reason.error) }
        : Cause.isDieReason(reason)
          ? { kind: "defect", detail: redactFailureDetail(reason.defect) }
          : {
              kind: "interruption",
              ...(reason.fiberId === undefined ? {} : { fiberId: reason.fiberId }),
            },
    ),
  };
}

/** Converts internal error detail to bounded JSON while masking common secrets. */
export function redactFailureDetail(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
  includeCauses = false,
): JsonValue {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[non-finite]";
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object" || seen.has(value)) return "[unavailable]";
  seen.add(value);
  if (value instanceof Error)
    return {
      name: redactText(value.name),
      message: redactText(value.message),
      ...(typeof value.stack === "string" ? { stack: redactText(value.stack) } : {}),
      ...(!includeCauses || Object.getOwnPropertyDescriptor(value, "code")?.value === undefined
        ? {}
        : {
            code: redactFailureDetail(
              Object.getOwnPropertyDescriptor(value, "code")?.value,
              seen,
              depth + 1,
              includeCauses,
            ),
          }),
      ...(!includeCauses || Object.getOwnPropertyDescriptor(value, "cause")?.value === undefined
        ? {}
        : {
            cause: redactFailureDetail(
              Object.getOwnPropertyDescriptor(value, "cause")?.value,
              seen,
              depth + 1,
              includeCauses,
            ),
          }),
    };
  if (Array.isArray(value))
    return value.map((entry) => redactFailureDetail(entry, seen, depth + 1, includeCauses));
  const output: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    output[key] = isSensitiveKey(key)
      ? "[REDACTED]"
      : property && "value" in property
        ? redactFailureDetail(property.value, seen, depth + 1, includeCauses)
        : "[unavailable]";
  }
  return output;
}
function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(?:authorization|cookie|password|passwd|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.slice(0, match.search(/[:=]/) + 1)}[REDACTED]`,
    );
}
function isSensitiveKey(value: string): boolean {
  return /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential/i.test(value);
}
