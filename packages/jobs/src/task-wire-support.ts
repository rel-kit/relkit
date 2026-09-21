import { assertJsonValue, canonicalJson, deepFreeze, type JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { JOBS_WIRE_VERSION } from "@relkit/contracts/jobs";
import { validate, type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";

export type TaskWireErrorCode =
  | "RELKIT_TASK_WIRE_INVALID"
  | "RELKIT_TASK_INPUT_INVALID"
  | "RELKIT_TASK_OUTPUT_INVALID"
  | "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY"
  | "RELKIT_TASK_INPUT_TOO_LARGE"
  | "RELKIT_TASK_OUTPUT_TOO_LARGE";

export class TaskWireValidationError extends TypeError {
  constructor(
    readonly code: TaskWireErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskWireValidationError";
  }
}

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

export function assertByteLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new TypeError("Wire byte limit must be positive");
}

export function assertEnvelope(value: unknown): asserts value is JobWireEnvelope {
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) invalidEnvelope();
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) invalidEnvelope();
  }
  if (!hasOwn(value, "version") || !hasOwn(value, "kind")) invalidEnvelope();
  if (value.kind !== "json" && value.kind !== "void") invalidEnvelope();
}

export function invalidEnvelope(): never {
  throw new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", "Invalid job wire envelope");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
