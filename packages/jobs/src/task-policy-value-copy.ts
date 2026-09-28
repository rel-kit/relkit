import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type { TaskConcurrency, TaskLogging, TaskResources } from "./task-types.js";
import {
  TASK_MAX_TAGS,
  assertBoundedString,
  assertFieldName,
  memoryBytes,
} from "./task-policy-value.js";

/** Copies unique, bounded task tags into a frozen list.
 * @param value - Candidate tags.
 * @returns Frozen tags or undefined when absent.
 * @throws TypeError for duplicates, invalid text, or excess tags.
 * @example copyTaskTags(["urgent"]);
 */
export function copyTaskTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > TASK_MAX_TAGS) {
    throw new TypeError(`Task tags must contain at most ${TASK_MAX_TAGS} entries`);
  }
  const tags = value.map((tag) => {
    assertBoundedString(tag, "Task tag");
    return tag;
  });
  if (new Set(tags).size !== tags.length) throw new TypeError("Task tags must be unique");
  return Object.freeze(tags);
}
/** Validates CPU and exact memory for a task resource request.
 * @param value - Candidate resource settings.
 * @returns Frozen settings or undefined when absent.
 * @throws TypeError for invalid CPU or memory.
 * @example copyResources({ cpu: 1, memory: "1 GiB" });
 */
export function copyResources(value: unknown): TaskResources | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.cpu !== "number" ||
    !Number.isFinite(value.cpu) ||
    value.cpu <= 0
  ) {
    throw new TypeError("resources.cpu must be a positive finite number");
  }
  if (typeof value.memory !== "string") {
    throw new TypeError("resources.memory must be a positive MiB or GiB duration");
  }
  memoryBytes(value.memory);
  return Object.freeze({ cpu: value.cpu, memory: value.memory as TaskResources["memory"] });
}
/** Validates a bounded concurrency limit and optional canonical scalar key.
 * @param value - Candidate concurrency policy.
 * @param canonicalSchema - Optional schema for validating the key field.
 * @returns Frozen policy or undefined when absent.
 * @throws TypeError for invalid limits or keys.
 * @example copyConcurrency({ limit: 2, key: "tenantId" }, schema);
 */
export function copyConcurrency(
  value: unknown,
  canonicalSchema?: StandardSchemaV1,
): TaskConcurrency | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task concurrency must be an object");
  const limit = value.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("concurrency.limit must be a positive integer");
  }
  const key = value.key;
  if (key !== undefined) {
    assertFieldName(key, "concurrency.key");
    if (canonicalSchema !== undefined)
      assertCanonicalScalarKey(canonicalSchema, key, "concurrency.key");
  }
  return Object.freeze({ limit, ...(key === undefined ? {} : { key }) });
}
/** Requires a projected required string or number field for partitioning.
 * @param schema - Canonical output schema.
 * @param key - Top-level field name.
 * @param name - Policy label for diagnostics.
 * @returns Nothing for a required scalar field.
 * @throws TypeError for missing or unsupported schema projections.
 * @example assertCanonicalScalarKey(schema, "tenantId", "concurrency.key");
 */
export function assertCanonicalScalarKey(
  schema: StandardSchemaV1,
  key: string,
  name: string,
): void {
  const projection = getJsonSchema(schema, { direction: "output" });
  if (
    !projection.ok ||
    !isRecord(projection.schema.properties) ||
    !Array.isArray(projection.schema.required)
  ) {
    throw new TypeError(`${name} requires a projected canonical object schema`);
  }
  if (!projection.schema.required.includes(key)) {
    throw new TypeError(`${name} must identify a required canonical field`);
  }
  const field = projection.schema.properties[key];
  if (
    !isRecord(field) ||
    (field.type !== "string" && field.type !== "number" && field.type !== "integer")
  ) {
    throw new TypeError(`${name} must identify a canonical string or number field`);
  }
}
/** Copies logging level and unique redaction keys.
 * @param value - Candidate logging policy.
 * @returns Frozen policy or undefined when absent.
 * @throws TypeError for invalid levels or redaction names.
 * @example copyLogging({ level: "info", redact: ["secret"] });
 */
export function copyLogging(value: unknown): TaskLogging | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task logging must be an object");
  if (
    value.level !== undefined &&
    !["trace", "debug", "info", "warn", "error"].includes(value.level as string)
  ) {
    throw new TypeError("logging.level is invalid");
  }
  if (value.redact !== undefined && !Array.isArray(value.redact)) {
    throw new TypeError("logging.redact must be an array of strings");
  }
  const redact = value.redact?.map((entry) => {
    assertBoundedString(entry, "logging.redact entry");
    return entry;
  });
  if (redact !== undefined && new Set(redact).size !== redact.length) {
    throw new TypeError("logging.redact entries must be unique");
  }
  return Object.freeze({
    ...(value.level === undefined ? {} : { level: value.level }),
    ...(redact === undefined ? {} : { redact: Object.freeze(redact) }),
  }) as TaskLogging;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
