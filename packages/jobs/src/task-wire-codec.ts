import type { JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { Effect } from "effect";
import { TASK_INPUT_MAX_BYTES, TASK_OUTPUT_MAX_BYTES } from "./task-policy-validation.js";
import { runWireSync, wireEffect } from "./task-wire-run.js";
import {
  decodeJobWire as decodeValue,
  encodeJobWire as encodeWireValue,
  encodeTaskInput as encodeInputValue,
  encodeTaskOutput as encodeOutputValue,
} from "./task-wire-value.js";
/** Encodes a generic job wire envelope in Effect.
 * @param value - Candidate JSON value.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope or TaskWireFailure.
 * @example Effect.runSync(encodeJobWireEffect({ id: 1 }));
 */
export const encodeJobWireEffect = Effect.fn("Jobs.encodeJobWire")(
  (value: unknown, maxBytes = TASK_INPUT_MAX_BYTES) =>
    wireEffect("taskWire.encodeJob", () => encodeWireValue(value, maxBytes)),
);
/** Synchronous generic job wire encoder.
 * @param value - Candidate JSON value.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope.
 * @throws TaskWireValidationError or TypeError for invalid input.
 * @example encodeJobWire({ id: 1 });
 */
export function encodeJobWire(value: unknown, maxBytes = TASK_INPUT_MAX_BYTES): JobWireEnvelope {
  return runWireSync(encodeJobWireEffect(value, maxBytes));
}
/** Encodes task input in Effect.
 * @param value - Candidate input.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope or TaskWireFailure.
 * @example Effect.runSync(encodeTaskInputEffect({ id: 1 }));
 */
export const encodeTaskInputEffect = Effect.fn("Jobs.encodeTaskInput")(
  (value: unknown, maxBytes = TASK_INPUT_MAX_BYTES) =>
    wireEffect("taskWire.encodeInput", () => encodeInputValue(value, maxBytes)),
);
/** Synchronous task input encoder.
 * @param value - Candidate input.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope.
 * @throws TaskWireValidationError or TypeError for invalid input.
 * @example encodeTaskInput({ id: 1 });
 */
export function encodeTaskInput(value: unknown, maxBytes = TASK_INPUT_MAX_BYTES): JobWireEnvelope {
  return runWireSync(encodeTaskInputEffect(value, maxBytes));
}
/** Encodes task output in Effect.
 * @param value - Candidate output.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope or TaskWireFailure.
 * @example Effect.runSync(encodeTaskOutputEffect("done"));
 */
export const encodeTaskOutputEffect = Effect.fn("Jobs.encodeTaskOutput")(
  (value: unknown, maxBytes = TASK_OUTPUT_MAX_BYTES) =>
    wireEffect("taskWire.encodeOutput", () => encodeOutputValue(value, maxBytes)),
);
/** Synchronous task output encoder.
 * @param value - Candidate output.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen envelope.
 * @throws TaskWireValidationError or TypeError for invalid output.
 * @example encodeTaskOutput("done");
 */
export function encodeTaskOutput(
  value: unknown,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): JobWireEnvelope {
  return runWireSync(encodeTaskOutputEffect(value, maxBytes));
}
/** Decodes and validates a job wire envelope in Effect.
 * @param envelope - Untrusted envelope.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen JSON value, void, or TaskWireFailure.
 * @example Effect.runSync(decodeJobWireEffect(encodeTaskInput("value")));
 */
export const decodeJobWireEffect = Effect.fn("Jobs.decodeJobWire")(
  (envelope: unknown, maxBytes = TASK_INPUT_MAX_BYTES) =>
    wireEffect("taskWire.decodeJob", () => decodeValue(envelope, maxBytes)),
);
/** Synchronous validated job wire decoder.
 * @param envelope - Untrusted envelope.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns A frozen JSON value or void.
 * @throws TaskWireValidationError or TypeError for malformed input.
 * @example decodeJobWire(encodeTaskInput("value"));
 */
export function decodeJobWire(
  envelope: unknown,
  maxBytes = TASK_INPUT_MAX_BYTES,
): JsonValue | undefined {
  return runWireSync(decodeJobWireEffect(envelope, maxBytes));
}
