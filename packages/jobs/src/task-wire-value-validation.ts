import { canonicalJson } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { TASK_INPUT_MAX_BYTES, TASK_OUTPUT_MAX_BYTES } from "./task-policy-validation.js";
import { encode, validateValue, TaskWireValidationError } from "./task-wire-support.js";

/** Validates authored task input and constructs its canonical wire form.
 * @param schema - Task input validator.
 * @param input - Authored input value.
 * @param maxBytes - Maximum encoded input bytes.
 * @returns Parsed input and canonical wire envelope.
 * @throws TaskWireValidationError for schema or size failures.
 * @example await validateTaskInput(schema, "hello");
 */
export async function validateTaskInput<S extends StandardSchemaV1>(
  schema: S,
  input: InferInput<S>,
  maxBytes = TASK_INPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  const value = await validateValue(schema, input, "RELKIT_TASK_INPUT_INVALID");
  return {
    value,
    wire: encode(
      value,
      maxBytes,
      "RELKIT_TASK_INPUT_INVALID",
      "RELKIT_TASK_INPUT_TOO_LARGE",
      "input",
    ),
  };
}
/** Validates retained input without changing its canonical JSON bytes.
 * @param schema - Original task input validator.
 * @param canonical - Retained canonical input.
 * @param inputWire - Optional identity validator for canonical values.
 * @param maxBytes - Maximum encoded input bytes.
 * @returns Validated canonical input.
 * @throws TaskWireValidationError for schema, size, or identity failures.
 * @example await validateCanonicalInput(schema, "hello");
 */
export async function validateCanonicalInput<S extends StandardSchemaV1>(
  schema: S,
  canonical: unknown,
  inputWire?: StandardSchemaV1<InferOutput<S>, InferOutput<S>>,
  maxBytes = TASK_INPUT_MAX_BYTES,
): Promise<InferOutput<S>> {
  const before = encode(
    canonical,
    maxBytes,
    "RELKIT_TASK_INPUT_INVALID",
    "RELKIT_TASK_INPUT_TOO_LARGE",
    "input",
  );
  const value = await validateValue(
    inputWire ?? (schema as StandardSchemaV1<InferOutput<S>, InferOutput<S>>),
    canonical as InferOutput<S>,
    "RELKIT_TASK_INPUT_INVALID",
  );
  const after = encode(
    value,
    maxBytes,
    "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY",
    "RELKIT_TASK_INPUT_TOO_LARGE",
    "input wire",
  );
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new TaskWireValidationError(
      "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY",
      "Task inputWire must preserve canonical JSON bytes",
    );
  }
  return value;
}
/** Validates task output and constructs its canonical wire form.
 * @param schema - Task output validator.
 * @param output - Handler output.
 * @param maxBytes - Maximum encoded output bytes.
 * @returns Parsed output and canonical wire envelope.
 * @throws TaskWireValidationError for schema or size failures.
 * @example await validateTaskOutput(schema, "done");
 */
export async function validateTaskOutput<S extends StandardSchemaV1>(
  schema: S,
  output: InferInput<S>,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  const value = await validateValue(schema, output, "RELKIT_TASK_OUTPUT_INVALID");
  return {
    value,
    wire: encode(
      value,
      maxBytes,
      "RELKIT_TASK_OUTPUT_INVALID",
      "RELKIT_TASK_OUTPUT_TOO_LARGE",
      "output",
    ),
  };
}
/** Validates retained output without changing canonical JSON bytes.
 * @param schema - Task output validator.
 * @param canonical - Retained output value.
 * @param maxBytes - Maximum encoded output bytes.
 * @returns Validated canonical output.
 * @throws TaskWireValidationError for schema, size, or identity failures.
 * @example await validateCanonicalOutput(schema, "done");
 */
export async function validateCanonicalOutput<S extends StandardSchemaV1>(
  schema: S,
  canonical: unknown,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): Promise<InferOutput<S>> {
  const before = encode(
    canonical,
    maxBytes,
    "RELKIT_TASK_OUTPUT_INVALID",
    "RELKIT_TASK_OUTPUT_TOO_LARGE",
    "output",
  );
  const value = await validateValue(
    schema,
    canonical as InferInput<S>,
    "RELKIT_TASK_OUTPUT_INVALID",
  );
  const after = encode(
    value,
    maxBytes,
    "RELKIT_TASK_OUTPUT_INVALID",
    "RELKIT_TASK_OUTPUT_TOO_LARGE",
    "output",
  );
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new TaskWireValidationError(
      "RELKIT_TASK_OUTPUT_INVALID",
      "Retained task output is not canonical",
    );
  }
  return value;
}
