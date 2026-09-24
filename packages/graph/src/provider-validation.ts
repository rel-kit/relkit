import { Effect } from "effect";
import {
  runValidation,
  validationEffect,
  type GraphValidationError,
} from "./graph-validation-error.js";
import { PROVIDER_CAPABILITIES, type DeploymentRole } from "./provider-nodes.js";
import {
  validateAdapter,
  validateLocal,
  validateNamedValues,
  validateProviderSource,
  validateRoleConsistency,
} from "./provider-validation-details.js";
import { isRecord, nonEmpty } from "./provider-validation-utils.js";
const deploymentRoles = ["engine", "host", "infrastructure", "access"] as const;
/**
 * Validates provider projection fields and deployment role consistency.
 * @param value - Candidate provider node.
 * @param index - Node index used in error messages.
 * @param fail - Graph validator's expected-failure callback.
 * @returns An Effect that succeeds with void or fails with GraphValidationError.
 * @example Effect.runSync(validateProviderNodeEffect(provider, 0, fail));
 */
export function validateProviderNodeEffect(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): Effect.Effect<void, GraphValidationError> {
  return validationEffect("validation.provider", () =>
    validateProviderNodeUnsafe(value, index, fail),
  );
}
/**
 * Synchronous compatibility adapter for provider validation.
 * @param value - Candidate provider node.
 * @param index - Node index used in error messages.
 * @param fail - Graph validator's expected-failure callback.
 * @returns Void when the provider projection is valid.
 * @throws TypeError for invalid provider fields.
 * @example validateProviderNode(provider, 0, fail);
 */
export function validateProviderNode(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  return runValidation(validateProviderNodeEffect(value, index, fail));
}
/**
 * Validates app or provider deployment role projections.
 * @param value - Candidate deployment roles.
 * @param index - Node index used in error messages.
 * @param owner - Whether the roles belong to an app or provider.
 * @param fail - Graph validator's expected-failure callback.
 * @returns An Effect that succeeds with void or fails with GraphValidationError.
 * @example Effect.runSync(validateDeploymentRolesEffect([], 0, "app", fail));
 */
export function validateDeploymentRolesEffect(
  value: unknown,
  index: number,
  owner: "app" | "provider",
  fail: (message: string) => never,
): Effect.Effect<void, GraphValidationError> {
  return validationEffect("validation.deployment-roles", () =>
    validateDeploymentRolesUnsafe(value, index, owner, fail),
  );
}
/**
 * Synchronous compatibility adapter for deployment roles.
 * @param value - Candidate deployment roles.
 * @param index - Node index used in error messages.
 * @param owner - Whether the roles belong to an app or provider.
 * @param fail - Graph validator's expected-failure callback.
 * @returns Void when roles are valid.
 * @throws TypeError for invalid or duplicate roles.
 * @example validateDeploymentRoles([], 0, "app", fail);
 */
export function validateDeploymentRoles(
  value: unknown,
  index: number,
  owner: "app" | "provider",
  fail: (message: string) => never,
): void {
  return runValidation(validateDeploymentRolesEffect(value, index, owner, fail));
}
function validateProviderNodeUnsafe(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  if (
    !(PROVIDER_CAPABILITIES as readonly unknown[]).includes(value.capability) ||
    !nonEmpty(value.profile) ||
    !isRecord(value.adapter) ||
    !isRecord(value.providerSource) ||
    !Array.isArray(value.namedValues) ||
    !Array.isArray(value.deploymentRoles) ||
    "ownership" in value
  ) {
    fail(`Graph nodes[${index}] provider metadata is invalid.`);
  }
  validateAdapter(value.adapter, index, fail);
  validateProviderSource(value.providerSource, index, fail);
  validateNamedValues(value, index, fail);
  validateLocal(value.local, index, fail);
  validateDeploymentRoles(value.deploymentRoles, index, "provider", fail);
  validateRoleConsistency(value, index, fail);
}
function validateDeploymentRolesUnsafe(
  value: unknown,
  index: number,
  owner: "app" | "provider",
  fail: (message: string) => never,
): void {
  if (value === undefined && owner === "app") return;
  if (!Array.isArray(value)) fail(`Graph nodes[${index}].deploymentRoles is invalid.`);
  const seen = new Set<string>();
  value.forEach((entry, roleIndex) => {
    if (isRecord(entry) && entry.protocolVersion !== 1)
      fail(
        `Graph nodes[${index}].deploymentRoles[${roleIndex}] protocol version ${String(entry.protocolVersion)} is unsupported; regenerate with \`relkit check\`.`,
      );
    if (
      !isRecord(entry) ||
      !(deploymentRoles as readonly unknown[]).includes(entry.role) ||
      !nonEmpty(entry.integrationId) ||
      entry.protocolVersion !== 1 ||
      !Object.hasOwn(entry, "configuration")
    ) {
      fail(`Graph nodes[${index}].deploymentRoles[${roleIndex}] is invalid.`);
    }
    const role = entry.role as DeploymentRole;
    if ((owner === "app") !== (role === "engine" || role === "host")) {
      fail(`Graph nodes[${index}].deploymentRoles[${roleIndex}] has an invalid role.`);
    }
    if (seen.has(role)) fail(`Graph nodes[${index}] has duplicate ${role} deployment roles.`);
    seen.add(role);
  });
}
