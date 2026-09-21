import { isStableId, normalizeSourceLocation } from "@relkit/contracts";
import { isGraphNodeKind } from "./model.js";
import { validateDeploymentRoles, validateProviderNode } from "./provider-validation.js";
import { validateServiceNode } from "./service-validation.js";
import { validateTelemetryConfiguration } from "./telemetry-validation.js";

export function validateNode(value: unknown, root: string | undefined, index: number): void {
  if (!isRecord(value) || !isGraphNodeKind(value.kind) || !isCanonicalId(value.id)) {
    fail(`Graph nodes[${index}] has an invalid kind or canonical id.`);
  }
  try {
    normalizeSourceLocation(value.source as never, root);
  } catch (error) {
    fail(
      `Graph nodes[${index}].source is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
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

function validateExposure(value: unknown, index: number): void {
  if (value !== undefined && value !== "public" && value !== "internal")
    fail(`Graph nodes[${index}].exposure is invalid.`);
}

function validateGenerated(value: unknown, index: number, field: string): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) fail(`Graph nodes[${index}].${field} is invalid.`);
  for (const key of ["agentId", "functionId"] as const)
    if (value[key] !== undefined) validateId(value[key], `Graph nodes[${index}].${field}.${key}`);
}

function validateHttpIdentities(value: unknown, index: number): void {
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

function validateIds(value: unknown, label: string): void {
  if (!Array.isArray(value)) fail(`${label} is invalid.`);
  value.forEach((entry, index) => validateId(entry, `${label}[${index}]`));
}

export function validateId(value: unknown, label: string): void {
  if (!isCanonicalId(value)) fail(`${label} is invalid.`);
}

export function isCanonicalId(value: unknown): value is string {
  return isStableId(value) && !value.startsWith("unbound.");
}

export function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
