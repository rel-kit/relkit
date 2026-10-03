import { assertJsonValue } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";

/** Standard Schema boundary requiring a JSON object job request envelope. */
export const jobEnvelopeSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "relkit-jobs-envelope",
    /** Require an object before applying the shared JSON safety validator.
     * @param value - Incoming jobs RPC request envelope.
     * @returns The JSON object or a Standard Schema issue for a non-object value.
     */
    validate(value: unknown) {
      if (!isRecord(value)) return { issues: [{ message: "Job RPC input must be an object." }] };
      assertJsonValue(value);
      return { value };
    },
  },
};

/** Standard Schema boundary requiring each outgoing job frame to be JSON-safe. */
export const jobItemSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "relkit-jobs-frame",
    /** Apply the shared JSON safety validator to an outgoing frame.
     * @param value - Job response or stream frame.
     * @returns The original validated JSON value.
     */
    validate(value: unknown) {
      assertJsonValue(value);
      return { value };
    },
  },
};

/** Recognize object envelopes before JSON validation.
 * @param value - Incoming jobs RPC envelope.
 * @returns Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
