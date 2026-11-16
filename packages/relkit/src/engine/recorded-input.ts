/**
 * What an invocation's span records as its input. A function bound to an event carries the
 * event's `sensitiveFields`; those fields are recorded as the redaction marker. The handler is
 * called with the input itself, so a reaction and a replay keep the real payload.
 */
import { redactNamedFields } from "../observability/redaction.js";

/**
 * Applies a target's sensitive input fields to the value that is about to be recorded.
 * @param target - The invocation target; `sensitiveInputFields` is set by `bindFunctionEvents`.
 * @param input - The input the handler receives.
 * @returns The input, or a copy with the marker in place of each sensitive field.
 * @example recordedInput({ sensitiveInputFields: ["cardNumber"] }, { cardNumber: "4111" });
 */
export function recordedInput(target: unknown, input: unknown): unknown {
  const fields =
    target !== null && typeof target === "object"
      ? (target as { readonly sensitiveInputFields?: unknown }).sensitiveInputFields
      : undefined;
  return Array.isArray(fields) && fields.length > 0
    ? redactNamedFields(input, fields as readonly string[])
    : input;
}
