import { Effect } from "effect";
import {
  failValidation,
  runValidation,
  validationEffect,
  type GraphValidationError,
} from "./graph-validation-error.js";
function fail(message: string): never {
  return failValidation(message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
/**
 * Validates service membership names and referenced identities.
 * @param value - Candidate service node fields.
 * @param index - Node index used in error messages.
 * @param validateId - Canonical ID validator supplied by graph validation.
 * @returns An Effect that succeeds with void or fails with GraphValidationError.
 * @example Effect.runSync(validateServiceNodeEffect(service, 0, validateId));
 */
export function validateServiceNodeEffect(
  value: Record<string, unknown>,
  index: number,
  validateId: (value: unknown, label: string) => void,
): Effect.Effect<void, GraphValidationError> {
  return validationEffect("validation.service", () =>
    validateServiceNodeUnsafe(value, index, validateId),
  );
}
/**
 * Synchronous compatibility adapter for service node validation.
 * @param value - Candidate service node fields.
 * @param index - Node index used in error messages.
 * @param validateId - Canonical ID validator.
 * @returns Void when the service shape is valid.
 * @throws TypeError for invalid members or IDs.
 * @example validateServiceNode(service, 0, validateId);
 */
export function validateServiceNode(
  value: Record<string, unknown>,
  index: number,
  validateId: (value: unknown, label: string) => void,
): void {
  return runValidation(validateServiceNodeEffect(value, index, validateId));
}
function validateServiceNodeUnsafe(
  value: Record<string, unknown>,
  index: number,
  validateId: (value: unknown, label: string) => void,
): void {
  if (!Array.isArray(value.functions)) fail(`Graph nodes[${index}].functions must be an array.`);
  if (!Array.isArray(value.events)) fail(`Graph nodes[${index}].events must be an array.`);
  const names = new Set<string>();
  value.functions.forEach((member, memberIndex) => {
    if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name)) {
      fail(`Graph nodes[${index}].functions[${memberIndex}] is invalid.`);
    }
    names.add(member.name);
    validateId(member.functionId, `Graph nodes[${index}].functions[${memberIndex}].functionId`);
  });
  value.events.forEach((member, memberIndex) => {
    if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name)) {
      fail(`Graph nodes[${index}].events[${memberIndex}] is invalid.`);
    }
    names.add(member.name);
    validateId(member.eventId, `Graph nodes[${index}].events[${memberIndex}].eventId`);
  });
  for (const [field, idField] of [
    ["tasks", "taskId"],
    ["jobs", "jobId"],
  ] as const) {
    if (value[field] === undefined) continue;
    if (!Array.isArray(value[field])) fail(`Graph nodes[${index}].${field} must be an array.`);
    value[field].forEach((member, memberIndex) => {
      if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name))
        fail(`Graph nodes[${index}].${field}[${memberIndex}] is invalid.`);
      names.add(member.name);
      validateId(member[idField], `Graph nodes[${index}].${field}[${memberIndex}].${idField}`);
    });
  }
  if (value.tags !== undefined && !textArray(value.tags))
    fail(`Graph nodes[${index}].tags is invalid.`);
  for (const field of ["title", "description"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      fail(`Graph nodes[${index}].${field} is invalid.`);
    }
  }
}
function textArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
