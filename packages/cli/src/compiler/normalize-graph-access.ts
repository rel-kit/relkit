/** Projects a function's `access` rule into graph metadata. */
import type { JsonValue } from "relkit/contracts";
import { isRecord } from "./normalize-utils.js";

/**
 * Describes who may call a function: its roles, its permissions and whether a predicate decides.
 * @param value - The function's extracted `access` option; predicates arrive as executable markers.
 * @returns Graph metadata, or undefined when the function has no access rule.
 * @example accessMetadata({ roles: ["admin"] }); // { roles: ["admin"] }
 */
export function accessMetadata(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const names = (field: unknown): string[] | undefined =>
    Array.isArray(field) && field.every((entry) => typeof entry === "string")
      ? [...field]
      : undefined;
  const roles = names(value.roles);
  const permissions = names(value.permissions);
  return {
    ...(roles === undefined ? {} : { roles }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(value.allow === undefined ? {} : { predicate: true }),
  };
}
