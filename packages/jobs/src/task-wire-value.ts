import { assertJsonValue, canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { JOBS_WIRE_VERSION } from "@relkit/contracts/jobs";
import { TASK_INPUT_MAX_BYTES, TASK_OUTPUT_MAX_BYTES } from "./task-policy-validation.js";
import {
  assertByteLimit,
  assertEnvelope,
  assertSize,
  encode,
  hasOwn,
  invalidEnvelope,
  message,
  TaskWireValidationError,
} from "./task-wire-support.js";
export { TaskWireValidationError } from "./task-wire-support.js";
export type { TaskWireErrorCode } from "./task-wire-support.js";
/** Encodes a generic jobs wire value with the input byte limit.
 * @param value - Canonical JSON or undefined for void.
 * @param maxBytes - Maximum encoded bytes.
 * @returns Frozen wire envelope.
 * @throws TaskWireValidationError for invalid or oversized data.
 * @example encodeJobWire({ id: "one" });
 */
export function encodeJobWire(value: unknown, maxBytes = TASK_INPUT_MAX_BYTES): JobWireEnvelope {
  return encode(value, maxBytes, "RELKIT_TASK_WIRE_INVALID", "RELKIT_TASK_WIRE_INVALID", "wire");
}
/** Encodes submitted task input with input-specific failure codes.
 * @param value - Parsed task input.
 * @param maxBytes - Maximum encoded bytes.
 * @returns Frozen input envelope.
 * @throws TaskWireValidationError for invalid or oversized input.
 * @example encodeTaskInput("hello");
 */
export function encodeTaskInput(value: unknown, maxBytes = TASK_INPUT_MAX_BYTES): JobWireEnvelope {
  return encode(
    value,
    maxBytes,
    "RELKIT_TASK_INPUT_INVALID",
    "RELKIT_TASK_INPUT_TOO_LARGE",
    "input",
  );
}
/** Encodes handler output with output-specific failure codes.
 * @param value - Parsed task output.
 * @param maxBytes - Maximum encoded bytes.
 * @returns Frozen output envelope.
 * @throws TaskWireValidationError for invalid or oversized output.
 * @example encodeTaskOutput("done");
 */
export function encodeTaskOutput(
  value: unknown,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): JobWireEnvelope {
  return encode(
    value,
    maxBytes,
    "RELKIT_TASK_OUTPUT_INVALID",
    "RELKIT_TASK_OUTPUT_TOO_LARGE",
    "output",
  );
}
/** Decodes a hostile wire envelope into immutable canonical JSON.
 * @param envelope - Untrusted encoded envelope.
 * @param maxBytes - Maximum encoded JSON bytes.
 * @returns Canonical JSON value or undefined for void.
 * @throws TaskWireValidationError for malformed or oversized envelopes.
 * @example decodeJobWire({ version: 1, kind: "void" });
 */
export function decodeJobWire(
  envelope: unknown,
  maxBytes = TASK_INPUT_MAX_BYTES,
): JsonValue | undefined {
  assertEnvelope(envelope);
  if (envelope.version !== JOBS_WIRE_VERSION) {
    throw new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", "Unsupported job wire version");
  }
  assertByteLimit(maxBytes);
  if (envelope.kind === "void") {
    if (Reflect.ownKeys(envelope).length !== 2) invalidEnvelope();
    return undefined;
  }
  if (Reflect.ownKeys(envelope).length !== 3 || !hasOwn(envelope, "value")) invalidEnvelope();
  try {
    const text = canonicalJson(envelope.value);
    assertSize(text, maxBytes, "RELKIT_TASK_WIRE_INVALID", "wire");
    const value = JSON.parse(text) as JsonValue;
    assertJsonValue(value);
    return deepFreeze(value);
  } catch (error) {
    if (error instanceof TaskWireValidationError) throw error;
    throw new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", message(error));
  }
}
export {
  validateTaskInput,
  validateCanonicalInput,
  validateTaskOutput,
  validateCanonicalOutput,
} from "./task-wire-value-validation.js";
