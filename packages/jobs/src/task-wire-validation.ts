import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { TASK_INPUT_MAX_BYTES, TASK_OUTPUT_MAX_BYTES } from "./task-policy-validation.js";
import { runWirePromise, wirePromiseEffect } from "./task-wire-run.js";
import {
  validateCanonicalInput as canonicalInputValue,
  validateCanonicalOutput as canonicalOutputValue,
  validateTaskInput as taskInputValue,
  validateTaskOutput as taskOutputValue,
} from "./task-wire-value.js";
/** Validates and encodes submitted task input in Effect.
 * @param schema - Task input schema.
 * @param input - Authored input.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Validated value and wire envelope or TaskWireFailure.
 * @example Effect.runPromise(validateTaskInputEffect(z.string(), "value"));
 */
export const validateTaskInputEffect = Effect.fn("Jobs.validateTaskInput")(
  <S extends StandardSchemaV1>(schema: S, input: InferInput<S>, maxBytes = TASK_INPUT_MAX_BYTES) =>
    wirePromiseEffect("taskWire.validateInput", () => taskInputValue(schema, input, maxBytes)),
);
/** Promise compatibility input validation.
 * @param schema - Task input schema.
 * @param input - Authored input.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Validated value and wire envelope.
 * @throws TaskWireValidationError or TypeError for invalid input.
 * @example await validateTaskInput(z.string(), "value");
 */
export function validateTaskInput<S extends StandardSchemaV1>(
  schema: S,
  input: InferInput<S>,
  maxBytes = TASK_INPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  return runWirePromise(validateTaskInputEffect(schema, input, maxBytes));
}
/** Validates retained canonical task input in Effect.
 * @param schema - Original input schema.
 * @param canonical - Retained canonical value.
 * @param inputWire - Optional identity validator for canonical input.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Canonical value or TaskWireFailure.
 * @example Effect.runPromise(validateCanonicalInputEffect(z.number(), 7));
 */
export const validateCanonicalInputEffect = Effect.fn("Jobs.validateCanonicalInput")(
  <S extends StandardSchemaV1>(
    schema: S,
    canonical: unknown,
    inputWire?: StandardSchemaV1<InferOutput<S>, InferOutput<S>>,
    maxBytes = TASK_INPUT_MAX_BYTES,
  ) =>
    wirePromiseEffect("taskWire.validateCanonicalInput", () =>
      canonicalInputValue(schema, canonical, inputWire, maxBytes),
    ),
);
/** Promise compatibility canonical input validation.
 * @param schema - Original input schema.
 * @param canonical - Retained canonical value.
 * @param inputWire - Optional identity validator.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Canonical input.
 * @throws TaskWireValidationError or TypeError for invalid input.
 * @example await validateCanonicalInput(z.number(), 7);
 */
export function validateCanonicalInput<S extends StandardSchemaV1>(
  schema: S,
  canonical: unknown,
  inputWire?: StandardSchemaV1<InferOutput<S>, InferOutput<S>>,
  maxBytes = TASK_INPUT_MAX_BYTES,
): Promise<InferOutput<S>> {
  return runWirePromise(validateCanonicalInputEffect(schema, canonical, inputWire, maxBytes));
}
/** Validates and encodes task output in Effect.
 * @param schema - Output schema.
 * @param output - Handler output.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Validated value and envelope or TaskWireFailure.
 * @example Effect.runPromise(validateTaskOutputEffect(z.string(), "done"));
 */
export const validateTaskOutputEffect = Effect.fn("Jobs.validateTaskOutput")(
  <S extends StandardSchemaV1>(
    schema: S,
    output: InferInput<S>,
    maxBytes = TASK_OUTPUT_MAX_BYTES,
  ) =>
    wirePromiseEffect("taskWire.validateOutput", () => taskOutputValue(schema, output, maxBytes)),
);
/** Promise compatibility output validation.
 * @param schema - Output schema.
 * @param output - Handler output.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Validated value and envelope.
 * @throws TaskWireValidationError or TypeError for invalid output.
 * @example await validateTaskOutput(z.string(), "done");
 */
export function validateTaskOutput<S extends StandardSchemaV1>(
  schema: S,
  output: InferInput<S>,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  return runWirePromise(validateTaskOutputEffect(schema, output, maxBytes));
}
/** Validates a retained canonical task output in Effect.
 * @param schema - Output schema.
 * @param canonical - Retained canonical value.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Canonical output or TaskWireFailure.
 * @example Effect.runPromise(validateCanonicalOutputEffect(z.string(), "done"));
 */
export const validateCanonicalOutputEffect = Effect.fn("Jobs.validateCanonicalOutput")(
  <S extends StandardSchemaV1>(schema: S, canonical: unknown, maxBytes = TASK_OUTPUT_MAX_BYTES) =>
    wirePromiseEffect("taskWire.validateCanonicalOutput", () =>
      canonicalOutputValue(schema, canonical, maxBytes),
    ),
);
/** Promise compatibility canonical output validation.
 * @param schema - Output schema.
 * @param canonical - Retained canonical value.
 * @param maxBytes - Maximum canonical encoded bytes.
 * @returns Canonical output.
 * @throws TaskWireValidationError or TypeError for invalid output.
 * @example await validateCanonicalOutput(z.string(), "done");
 */
export function validateCanonicalOutput<S extends StandardSchemaV1>(
  schema: S,
  canonical: unknown,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): Promise<InferOutput<S>> {
  return runWirePromise(validateCanonicalOutputEffect(schema, canonical, maxBytes));
}
