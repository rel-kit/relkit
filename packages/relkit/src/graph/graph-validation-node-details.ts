import { failValidation as fail } from "./graph-validation-error.js";
import { isRecord, validateId } from "./graph-validation-primitives.js";

/** Validates a domain node's public or internal exposure.
 * @param value - Optional exposure value.
 * @param index - Node index used in diagnostics.
 * @returns Void for valid input; raises a graph validation fault otherwise.
 * @example validateExposure("public", 0);
 */
export function validateExposure(value: unknown, index: number): void {
  if (value !== undefined && value !== "public" && value !== "internal")
    fail(`Graph nodes[${index}].exposure is invalid.`);
}

/** Validates identities attached to a generated function marker.
 * @param value - Optional generated metadata.
 * @param index - Node index used in diagnostics.
 * @param field - Marker field name for diagnostics.
 * @returns Void for valid input; raises a graph validation fault otherwise.
 * @example validateGenerated({ agentId: "orders.agent" }, 0, "generated");
 */
export function validateGenerated(value: unknown, index: number, field: string): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) fail(`Graph nodes[${index}].${field} is invalid.`);
  for (const key of ["agentId", "functionId"] as const)
    if (value[key] !== undefined) validateId(value[key], `Graph nodes[${index}].${field}.${key}`);
}

/** Validates route middleware, transform, and rate-limit identities.
 * @param value - Candidate HTTP configuration.
 * @param index - Node index used in diagnostics.
 * @returns Void for valid input; raises a graph validation fault otherwise.
 * @example validateHttpIdentities({ middleware: [], transforms: [] }, 0);
 */
export function validateHttpIdentities(value: unknown, index: number): void {
  if (!isRecord(value)) return;
  for (const field of ["middleware", "transforms"] as const) {
    if (!Array.isArray(value[field])) continue;
    value[field].forEach((entry, entryIndex) => {
      if (!isRecord(entry))
        fail(`Graph nodes[${index}].config.${field}[${entryIndex}] is invalid.`);
      validateId(entry.id, `Graph nodes[${index}].config.${field}[${entryIndex}].id`);
      if (
        field === "middleware" &&
        (typeof entry.path !== "string" ||
          !Number.isSafeInteger(entry.order) ||
          (entry.match !== "always" && entry.match !== "conditional"))
      )
        fail(`Graph nodes[${index}].config.middleware[${entryIndex}] is invalid.`);
      if (entry.targetFunctionId !== undefined)
        validateId(
          entry.targetFunctionId,
          `Graph nodes[${index}].config.${field}[${entryIndex}].targetFunctionId`,
        );
    });
  }
  if (isRecord(value.rateLimit) && value.rateLimit.storeId !== undefined)
    validateId(value.rateLimit.storeId, `Graph nodes[${index}].config.rateLimit.storeId`);
}

/** Validates every identity in a node reference list.
 * @param value - Candidate list of graph IDs.
 * @param label - Field label for diagnostics.
 * @returns Void for valid input; raises a graph validation fault otherwise.
 * @example validateIds(["orders.lookup"], "Graph nodes[0].toolIds");
 */
export function validateIds(value: unknown, label: string): void {
  if (!Array.isArray(value)) fail(`${label} is invalid.`);
  value.forEach((entry, index) => validateId(entry, `${label}[${index}]`));
}
