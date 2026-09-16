import { assertJsonValue, canonicalJson, deepFreeze } from "@relkit/contracts";
import type { JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { JOBS_WIRE_VERSION } from "@relkit/contracts/jobs";
import {
  validate,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@relkit/schema";
import {
  TASK_INPUT_MAX_BYTES,
  TASK_OUTPUT_MAX_BYTES,
} from "./task-policy-validation.js";

export type TaskWireErrorCode =
  | "RELKIT_TASK_WIRE_INVALID"
  | "RELKIT_TASK_INPUT_INVALID"
  | "RELKIT_TASK_OUTPUT_INVALID"
  | "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY"
  | "RELKIT_TASK_INPUT_TOO_LARGE"
  | "RELKIT_TASK_OUTPUT_TOO_LARGE";

export class TaskWireValidationError extends TypeError {
  constructor(readonly code: TaskWireErrorCode, message: string) {
    super(message);
    this.name = "TaskWireValidationError";
  }
}

export function encodeJobWire(
  value: unknown,
  maxBytes = TASK_INPUT_MAX_BYTES,
): JobWireEnvelope {
  return encode(value, maxBytes, "RELKIT_TASK_WIRE_INVALID", "RELKIT_TASK_WIRE_INVALID", "wire");
}

export function encodeTaskInput(value: unknown, maxBytes = TASK_INPUT_MAX_BYTES): JobWireEnvelope {
  return encode(value, maxBytes, "RELKIT_TASK_INPUT_INVALID", "RELKIT_TASK_INPUT_TOO_LARGE", "input");
}

export function encodeTaskOutput(value: unknown, maxBytes = TASK_OUTPUT_MAX_BYTES): JobWireEnvelope {
  return encode(value, maxBytes, "RELKIT_TASK_OUTPUT_INVALID", "RELKIT_TASK_OUTPUT_TOO_LARGE", "output");
}

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

export async function validateTaskInput<S extends StandardSchemaV1>(
  schema: S,
  input: InferInput<S>,
  maxBytes = TASK_INPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  const value = await validateValue(schema, input, "RELKIT_TASK_INPUT_INVALID");
  return {
    value,
    wire: encode(value, maxBytes, "RELKIT_TASK_INPUT_INVALID", "RELKIT_TASK_INPUT_TOO_LARGE", "input"),
  };
}

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

export async function validateTaskOutput<S extends StandardSchemaV1>(
  schema: S,
  output: InferInput<S>,
  maxBytes = TASK_OUTPUT_MAX_BYTES,
): Promise<{ readonly value: InferOutput<S>; readonly wire: JobWireEnvelope }> {
  const value = await validateValue(schema, output, "RELKIT_TASK_OUTPUT_INVALID");
  return {
    value,
    wire: encode(value, maxBytes, "RELKIT_TASK_OUTPUT_INVALID", "RELKIT_TASK_OUTPUT_TOO_LARGE", "output"),
  };
}

/** Validates a retained output that is already in canonical output form. */
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

function encode(
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
    throw new TaskWireValidationError(invalidCode, `${name} is not canonical JSON: ${message(error)}`);
  }
}

async function validateValue<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
  code: Extract<TaskWireErrorCode, "RELKIT_TASK_INPUT_INVALID" | "RELKIT_TASK_OUTPUT_INVALID">,
): Promise<InferOutput<S>> {
  try {
    const result = await validate(schema, value);
    if (!("value" in result)) {
      throw new TaskWireValidationError(code, result.issues[0]?.message ?? "Schema validation failed");
    }
    return result.value;
  } catch (error) {
    if (error instanceof TaskWireValidationError) throw error;
    throw new TaskWireValidationError(code, message(error));
  }
}

function assertSize(text: string, maxBytes: number, code: TaskWireErrorCode, name: string): void {
  assertByteLimit(maxBytes);
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new TaskWireValidationError(code, `${name} exceeds ${maxBytes} encoded bytes`);
  }
}

function assertByteLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Wire byte limit must be positive");
}

function assertEnvelope(value: unknown): asserts value is JobWireEnvelope {
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) invalidEnvelope();
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) invalidEnvelope();
  }
  if (!hasOwn(value, "version") || !hasOwn(value, "kind")) invalidEnvelope();
  if (value.kind !== "json" && value.kind !== "void") invalidEnvelope();
}

function invalidEnvelope(): never {
  throw new TaskWireValidationError("RELKIT_TASK_WIRE_INVALID", "Invalid job wire envelope");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
