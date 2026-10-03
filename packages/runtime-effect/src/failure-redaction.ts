import { Cause } from "effect";
import type { JsonValue } from "@relkit/contracts";

// Node 24 exposes the built-in stack through a shared accessor; Bun uses a data field.
const nativeStackGetter = Object.getOwnPropertyDescriptor(new Error(), "stack")?.get;

/**
 * Projects failures, defects and interruption into redacted JSON.
 * @param cause - Effect cause containing its original reasons.
 * @returns A JSON-safe reason list preserving outcome kinds.
 */
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

/**
 * Converts internal detail to bounded JSON while masking common secrets.
 * @param value - Internal detail.
 * @param seen - Cycle guard shared during recursive projection.
 * @param depth - Current nesting depth.
 * @param includeCauses - Whether own error cause and code fields are included.
 * @returns Redacted JSON without evaluating user-defined getters.
 */
export function redactFailureDetail(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
  includeCauses = false,
): JsonValue {
  try {
    return projectDetail(value, seen, depth, includeCauses);
  } catch {
    return "[unavailable]";
  }
}

/** Projects already bounded values using descriptors instead of invoking getters.
 * @param value - Internal detail at the current recursion depth.
 * @param seen - Objects already projected.
 * @param depth - Current nesting depth.
 * @param includeCauses - Whether internal cause/code descriptors are included.
 * @returns A JSON-safe projection; inaccessible proxy descriptors are handled by the caller.
 */
function projectDetail(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  includeCauses: boolean,
): JsonValue {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[non-finite]";
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object" || seen.has(value)) return "[unavailable]";
  seen.add(value);
  if (value instanceof Error) {
    const name = errorText(value, "name");
    const message = errorText(value, "message");
    // Lazy stack materialization can invoke Error name/message getters in V8.
    const stackProperty =
      name === "[unavailable]" || message === "[unavailable]"
        ? undefined
        : Object.getOwnPropertyDescriptor(value, "stack");
    const stack =
      stackProperty !== undefined && "value" in stackProperty
        ? stackProperty.value
        : nativeStackGetter !== undefined && stackProperty?.get === nativeStackGetter
          ? nativeStackGetter.call(value)
          : undefined;
    return {
      name,
      message,
      ...(typeof stack === "string" ? { stack: redactText(stack) } : {}),
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
  }
  if (Array.isArray(value))
    return Array.from({ length: value.length }, (_, index) => {
      const property = Object.getOwnPropertyDescriptor(value, String(index));
      return property === undefined
        ? null
        : "value" in property
          ? redactFailureDetail(property.value, seen, depth + 1, includeCauses)
          : "[unavailable]";
    });
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

/** Reads bounded Error prototype data without invoking accessor properties.
 * @param value - Error whose built-in name/message may be inherited.
 * @param key - Built-in textual field.
 * @returns Redacted text or an unavailable marker for accessors and unknown values.
 */
function errorText(value: Error, key: "name" | "message"): string {
  let current: object | null = value;
  for (let depth = 0; current !== null && depth <= 6; depth += 1) {
    const property = Object.getOwnPropertyDescriptor(current, key);
    if (property !== undefined)
      return "value" in property && typeof property.value === "string"
        ? redactText(property.value)
        : "[unavailable]";
    current = Object.getPrototypeOf(current);
  }
  return "[unavailable]";
}

/**
 * Masks bearer credentials and common secret assignments.
 * @param value - Potentially sensitive text.
 * @returns Text with recognized secret values replaced.
 */
function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(?:authorization|cookie|password|passwd|secret|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.slice(0, match.search(/[:=]/) + 1)}[REDACTED]`,
    );
}

/**
 * Recognizes field names that carry credentials.
 * @param value - Object field name.
 * @returns Whether the field's value must be masked.
 */
function isSensitiveKey(value: string): boolean {
  return /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential/i.test(value);
}
