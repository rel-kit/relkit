import { assertJsonValue, canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { JOBS_WIRE_VERSION } from "@relkit/contracts/jobs";
import { validate, type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import type { TaskWireErrorCode } from "./task-wire-support.types.js";

export type { TaskWireErrorCode } from "./task-wire-support.types.js";

/** Invalid canonical task wire data with a stable machine-readable code.
 * @example new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", "Invalid envelope");
 */
export class TaskWireValidationError extends TypeError {
  /** @param code - Stable wire failure code.
   * @param message - Human-readable failure reason.
   */
  constructor(
    readonly code: TaskWireErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskWireValidationError";
  }
}

/** Canonicalizes JSON or void data into a bounded wire envelope.
 * @param value - Value to encode.
 * @param maxBytes - Maximum UTF-8 JSON size.
 * @param invalidCode - Error code for noncanonical data.
 * @param sizeCode - Error code for oversized data.
 * @param name - Field label for diagnostics.
 * @returns Frozen canonical wire envelope.
 * @throws TaskWireValidationError or TypeError for invalid data or limit.
 * @example encode({ id: "one" }, 1024, "RELKIT_TASK_INPUT_INVALID", "RELKIT_TASK_INPUT_TOO_LARGE", "input");
 */
export function encode(
  value: unknown,
  maxBytes: number,
  invalidCode: TaskWireErrorCode,
  sizeCode: TaskWireErrorCode,
  name: string,
): JobWireEnvelope {
  assertByteLimit(maxBytes);
  if (value === undefined) return Object.freeze({ version: JOBS_WIRE_VERSION, kind: "void" });
  try {
    const text = canonicalJson(value);
    assertSize(text, maxBytes, sizeCode, name);
    const json = deepFreeze(JSON.parse(text) as JsonValue);
    assertJsonValue(json);
    return Object.freeze({ version: JOBS_WIRE_VERSION, kind: "json", value: json });
  } catch (error) {
    if (error instanceof TaskWireValidationError) throw error;
    throw new TaskWireValidationError(
      invalidCode,
      `${name} is not canonical JSON: ${message(error)}`,
    );
  }
}

/** Runs Standard Schema validation and retains its parsed output.
 * @param schema - Input or output validator.
 * @param value - Candidate value.
 * @param code - Stable validation failure code.
 * @returns Parsed schema output.
 * @throws TaskWireValidationError for issues or validator rejection.
 * @example await validateValue(schema, "hello", "RELKIT_TASK_INPUT_INVALID");
 */
export async function validateValue<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
  code: Extract<TaskWireErrorCode, "RELKIT_TASK_INPUT_INVALID" | "RELKIT_TASK_OUTPUT_INVALID">,
): Promise<InferOutput<S>> {
  try {
    const result = await validate(schema, value);
    if (!("value" in result)) {
      throw new TaskWireValidationError(
        code,
        result.issues[0]?.message ?? "Schema validation failed",
      );
    }
    return result.value;
  } catch (error) {
    if (error instanceof TaskWireValidationError) throw error;
    throw new TaskWireValidationError(code, message(error));
  }
}

/** Enforces the encoded UTF-8 size for canonical JSON text.
 * @param text - Canonical JSON text.
 * @param maxBytes - Maximum encoded byte count.
 * @param code - Error code for oversized data.
 * @param name - Field label for diagnostics.
 * @returns Nothing when within the limit.
 * @throws TaskWireValidationError or TypeError for invalid size.
 * @example assertSize("{}", 1024, "RELKIT_TASK_INPUT_TOO_LARGE", "input");
 */
export function assertSize(
  text: string,
  maxBytes: number,
  code: TaskWireErrorCode,
  name: string,
): void {
  assertByteLimit(maxBytes);
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new TaskWireValidationError(code, `${name} exceeds ${maxBytes} encoded bytes`);
  }
}

/** Requires a positive safe integer wire size limit.
 * @param maxBytes - Candidate byte limit.
 * @returns Nothing for a valid limit.
 * @throws TypeError for zero, negative, or noninteger limits.
 * @example assertByteLimit(1024);
 */
export function assertByteLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new TypeError("Wire byte limit must be positive");
}

/** Rejects hostile or malformed wire envelope object shapes.
 * @param value - Untrusted envelope candidate.
 * @returns Nothing when the shape has own data properties and a known kind.
 * @throws TaskWireValidationError for invalid or accessor-backed envelopes.
 * @example assertEnvelope({ version: 1, kind: "void" });
 */
export function assertEnvelope(value: unknown): asserts value is JobWireEnvelope {
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) invalidEnvelope();
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) invalidEnvelope();
  }
  if (!hasOwn(value, "version") || !hasOwn(value, "kind")) invalidEnvelope();
  if (value.kind !== "json" && value.kind !== "void") invalidEnvelope();
}

/** Fails with the stable invalid-envelope error.
 * @returns Never; this function always throws.
 * @throws TaskWireValidationError with the wire-invalid code.
 * @example if (invalid) invalidEnvelope();
 */
export function invalidEnvelope(): never {
  throw new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", "Invalid job wire envelope");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/** Checks an envelope's own property without consulting its prototype.
 * @param value - Envelope object.
 * @param key - Property to check.
 * @returns True when the property is owned.
 * @example hasOwn({ kind: "void" }, "kind");
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Converts a validator rejection into a bounded diagnostic string.
 * @param error - Caught validation cause.
 * @returns Error message or string representation.
 * @example message(new Error("invalid"));
 */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
