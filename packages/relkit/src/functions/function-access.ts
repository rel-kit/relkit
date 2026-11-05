/** Validates and copies a function's `access` rule. */
import type { AccessRule } from "../contracts/index.js";
import { FunctionInputError } from "./function-input-error.js";

/** Checks the shape of an access rule and returns a frozen copy.
 * @param access - Rule from `defineFunction` options.
 * @returns The frozen rule, or undefined when none is set.
 * @throws FunctionInputError for a rule that is not roles, permissions and a predicate.
 * @example copyAccess({ roles: ["admin"] });
 */
export function copyAccess(
  access: AccessRule<never, unknown> | undefined,
): AccessRule<never, unknown> | undefined {
  if (access === undefined) return undefined;
  if (access === null || typeof access !== "object" || Array.isArray(access))
    throw new FunctionInputError(
      "Function access must be an object of roles, permissions and allow",
    );
  for (const key of Object.keys(access))
    if (key !== "roles" && key !== "permissions" && key !== "allow")
      throw new FunctionInputError(`Function access does not support "${key}"`);
  const roles = names(access.roles, "roles");
  const permissions = names(access.permissions, "permissions");
  for (const permission of permissions ?? [])
    if (!/^[^:\s]+:[^:\s]+$/u.test(permission))
      throw new FunctionInputError(
        `Function access permission "${permission}" must have the form resource:action`,
      );
  if (access.allow !== undefined && typeof access.allow !== "function")
    throw new FunctionInputError("Function access allow must be a function");
  if (roles === undefined && permissions === undefined && access.allow === undefined)
    throw new FunctionInputError("Function access needs roles, permissions or allow");
  return Object.freeze({
    ...(roles === undefined ? {} : { roles }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(access.allow === undefined ? {} : { allow: access.allow }),
  });
}

function names(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === "string" && entry.trim() !== "")
  )
    throw new FunctionInputError(`Function access ${field} must be a non-empty list of names`);
  return Object.freeze([...(value as string[])]);
}
