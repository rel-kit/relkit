import { isRuntimeActivationFingerprint } from "@relkit/contracts";
import type { ObservableGenerationFixture } from "./observability.types.js";

/** Reads the native SSE fixture fields without inventing a JSON contract cast.
 * @param data - Actual generation event data. @returns The original three asserted fields, or fails on malformed output. */
export function generationFixture(data: unknown): ObservableGenerationFixture {
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new TypeError("Expected generation event data.");
  const fields = Object.getOwnPropertyDescriptors(data);
  const graphHash = fields.graphHash?.value;
  const event = fields.event?.value;
  const activationFingerprint = fields.activationFingerprint?.value;
  if (
    typeof graphHash !== "string" ||
    typeof event !== "string" ||
    !isRuntimeActivationFingerprint(activationFingerprint)
  )
    throw new TypeError("Expected complete generation fixture identity.");
  return { graphHash, event, activationFingerprint };
}
