import { normalizeSourceLocation, SourceLocationError } from "@relkit/contracts";
import { Effect } from "effect";
import {
  failValidation as fail,
  runValidation,
  validationEffect,
  type GraphValidationError,
} from "./graph-validation-error.js";
import { isCanonicalId, isRecord, nonEmpty, validateId } from "./graph-validation-primitives.js";
import {
  validateExposure,
  validateGenerated,
  validateHttpIdentities,
  validateIds,
} from "./graph-validation-node-details.js";
import { isGraphNodeKind } from "./model.js";
import { validateDeploymentRoles, validateProviderNode } from "./provider-validation.js";
import { validateServiceNode } from "./service-validation.js";
import { validateTelemetryConfiguration } from "./telemetry-validation.js";
export {
  isCanonicalId,
  isCanonicalIdEffect,
  nonEmpty,
  nonEmptyEffect,
  validateId,
  validateIdEffect,
} from "./graph-validation-primitives.js";
/**
 * Validates one graph node's identity, source, and kind-specific projection.
 * @param value - Candidate graph node.
 * @param root - Optional project root for source path validation.
 * @param index - Node index used in failure messages.
 * @returns An Effect that succeeds with void or fails with GraphValidationError.
 * @example Effect.runSync(validateNodeEffect(node, undefined, 0));
 */
export function validateNodeEffect(
  value: unknown,
  root: string | undefined,
  index: number,
): Effect.Effect<void, GraphValidationError> {
  return validationEffect("validation.node", () => validateNodeUnsafe(value, root, index));
}
/**
 * Synchronous compatibility adapter for node validation.
 * @param value - Candidate graph node.
 * @param root - Optional project root for source path validation.
 * @param index - Node index used in failure messages.
 * @returns Void when the node is valid.
 * @throws TypeError for invalid identity, source, or metadata.
 * @example validateNode(node, undefined, 0);
 */
export function validateNode(value: unknown, root: string | undefined, index: number): void {
  return runValidation(validateNodeEffect(value, root, index));
}
function validateNodeUnsafe(value: unknown, root: string | undefined, index: number): void {
  if (!isRecord(value) || !isGraphNodeKind(value.kind) || !isCanonicalId(value.id)) {
    fail(`Graph nodes[${index}] has an invalid kind or canonical id.`);
  }
  try {
    normalizeSourceLocation(value.source as never, root);
  } catch (error) {
    if (error instanceof SourceLocationError)
      fail(`Graph nodes[${index}].source is invalid: ${error.message}`);
    throw error;
  }
  if ("targetFunctionId" in value)
    validateId(value.targetFunctionId, `Graph nodes[${index}].targetFunctionId`);
  if (value.domainId !== undefined) validateId(value.domainId, `Graph nodes[${index}].domainId`);
  if (value.kind === "function") {
    if (value.invocationMode !== "callable" && value.invocationMode !== "event-only")
      fail(`Function "${value.id}" requires a valid invocationMode.`);
    validateGenerated(value.generated, index, "generated");
    validateExposure(value.exposure, index);
  }
  if (value.kind === "task") {
    validateId(value.taskId, `Graph nodes[${index}].taskId`);
    if (typeof value.version !== "string" || value.version.length === 0)
      fail(`Task "${value.id}" requires a version.`);
    if (value.execution !== "durable" && value.execution !== "retryable")
      fail(`Task "${value.id}" execution is invalid.`);
  }
  if (value.kind === "job") {
    if (value.executionModel === "task") {
      if (!nonEmpty(value.name)) fail(`Graph nodes[${index}].name is invalid.`);
      validateId(value.jobId, `Graph nodes[${index}].jobId`);
      validateId(value.taskId, `Graph nodes[${index}].taskId`);
      if (!nonEmpty(value.taskVersion)) fail(`Graph nodes[${index}].taskVersion is invalid.`);
      if (!nonEmpty(value.profile)) fail(`Graph nodes[${index}].profile is invalid.`);
      if (typeof value.implicit !== "boolean" || typeof value.default !== "boolean")
        fail(`Graph nodes[${index}] task binding flags are invalid.`);
    } else if (value.executionModel !== undefined && value.executionModel !== "legacy-function") {
      fail(`Graph nodes[${index}].executionModel is invalid.`);
    }
  }
  if (value.kind === "event" || value.kind === "error") validateExposure(value.exposure, index);
  if (value.kind === "agent") {
    validateIds(value.toolIds, `Graph nodes[${index}].toolIds`);
    validateGenerated(value.generatedFunction, index, "generatedFunction");
    if (value.backendBucketId !== undefined)
      validateId(value.backendBucketId, `Graph nodes[${index}].backendBucketId`);
  }
  if (value.kind === "trigger" && value.triggerType === "http")
    validateHttpIdentities(value.config, index);
  if (value.kind === "service") validateServiceNode(value, index, validateId);
  if (value.kind === "provider") validateProviderNode(value, index, fail);
  if (value.kind === "app") {
    if ("providerBindings" in value || "observability" in value)
      fail(`Graph nodes[${index}] contains legacy provider data.`);
    validateDeploymentRoles(value.deploymentRoles, index, "app", fail);
    validateTelemetryConfiguration(value.telemetry, index, fail);
  }
  if (
    value.kind === "middleware" &&
    (typeof value.path !== "string" || !Number.isSafeInteger(value.order))
  )
    fail(`Graph nodes[${index}] middleware metadata is invalid.`);
  if (value.kind === "hook") {
    validateId(value.ownerId, `Graph nodes[${index}].ownerId`);
    if (value.ownerKind !== "function" && value.ownerKind !== "tool" && value.ownerKind !== "task")
      fail(`Graph nodes[${index}].ownerKind is invalid.`);
    const validPhase =
      value.ownerKind === "task"
        ? value.phase === "start" || value.phase === "success" || value.phase === "failure"
        : value.phase === "before" || value.phase === "after";
    if (!validPhase) fail(`Graph nodes[${index}].phase is invalid.`);
  }
}
