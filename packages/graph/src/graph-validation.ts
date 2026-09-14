import { GRAPH_VERSION, isStableId, normalizeSourceLocation } from "@relkit/contracts";
import { isGraphEdgeKind, isGraphNodeKind } from "./model.js";
import { validateDeploymentRoles, validateProviderNode } from "./provider-validation.js";
import { validateServiceNode } from "./service-validation.js";
import { validateEventTargets } from "./event-validation.js";
import { validateTelemetryConfiguration } from "./telemetry-validation.js";

export function validateGraphShape(value: unknown, root?: string): void {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail("A graph must contain nodes and edges arrays.");
  }
  if (value.contractVersion !== GRAPH_VERSION)
    fail(
      `Graph contract version ${String(value.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Regenerate with \`relkit check\`.`,
    );
  rejectUnboundIdentities(value);
  if (value.appId !== undefined && !isCanonicalId(value.appId)) fail("Graph appId is invalid.");
  const nodes = value.nodes as readonly unknown[];
  const edges = value.edges as readonly unknown[];
  nodes.forEach((node, index) => validateNode(node, root, index));
  edges.forEach((edge, index) => validateEdge(edge, index, nodes));
  validateEventTargets(value as unknown as import("./model.js").ApplicationGraph);
}

function validateNode(value: unknown, root: string | undefined, index: number): void {
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
  if ("targetFunctionId" in value) {
    validateId(value.targetFunctionId, `Graph nodes[${index}].targetFunctionId`);
  }
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
    if (value.backendBucketId !== undefined) {
      validateId(value.backendBucketId, `Graph nodes[${index}].backendBucketId`);
    }
  }
  if (value.kind === "trigger" && value.triggerType === "http") {
    validateHttpIdentities(value.config, index);
  }
  if (value.kind === "service") validateServiceNode(value, index, validateId);
  if (value.kind === "provider") validateProviderNode(value, index, fail);
  if (value.kind === "app") {
    if ("providerBindings" in value || "observability" in value)
      fail(`Graph nodes[${index}] contains legacy provider data.`);
    validateDeploymentRoles(value.deploymentRoles, index, "app", fail);
    validateTelemetryConfiguration(value.telemetry, index, fail);
  }
  if (value.kind === "middleware") {
    if (typeof value.path !== "string" || !Number.isSafeInteger(value.order)) {
      fail(`Graph nodes[${index}] middleware metadata is invalid.`);
    }
  }
  if (value.kind === "hook") {
    validateId(value.ownerId, `Graph nodes[${index}].ownerId`);
    if (!(value.ownerKind === "function" || value.ownerKind === "tool" || value.ownerKind === "task")) {
      fail(`Graph nodes[${index}].ownerKind is invalid.`);
    }
    const validPhase =
      value.ownerKind === "task"
        ? value.phase === "start" || value.phase === "success" || value.phase === "failure"
        : value.phase === "before" || value.phase === "after";
    if (!validPhase) {
      fail(`Graph nodes[${index}].phase is invalid.`);
    }
  }
}

function validateExposure(value: unknown, index: number): void {
  if (value !== undefined && value !== "public" && value !== "internal") {
    fail(`Graph nodes[${index}].exposure is invalid.`);
  }
}

function validateGenerated(value: unknown, index: number, field: string): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) fail(`Graph nodes[${index}].${field} is invalid.`);
  for (const key of ["agentId", "functionId"] as const) {
    if (value[key] !== undefined) validateId(value[key], `Graph nodes[${index}].${field}.${key}`);
  }
}

function validateHttpIdentities(value: unknown, index: number): void {
  if (!isRecord(value)) return;
  for (const field of ["middleware", "transforms"] as const) {
    if (!Array.isArray(value[field])) continue;
    value[field].forEach((entry, entryIndex) => {
      if (!isRecord(entry))
        fail(`Graph nodes[${index}].config.${field}[${entryIndex}] is invalid.`);
      validateId(entry.id, `Graph nodes[${index}].config.${field}[${entryIndex}].id`);
      if (field === "middleware") {
        if (
          typeof entry.path !== "string" ||
          !Number.isSafeInteger(entry.order) ||
          (entry.match !== "always" && entry.match !== "conditional")
        )
          fail(`Graph nodes[${index}].config.middleware[${entryIndex}] is invalid.`);
      }
      if (entry.targetFunctionId !== undefined) {
        validateId(
          entry.targetFunctionId,
          `Graph nodes[${index}].config.${field}[${entryIndex}].targetFunctionId`,
        );
      }
    });
  }
  if (isRecord(value.rateLimit) && value.rateLimit.storeId !== undefined) {
    validateId(value.rateLimit.storeId, `Graph nodes[${index}].config.rateLimit.storeId`);
  }
}

function validateEdge(value: unknown, index: number, nodes: readonly unknown[]): void {
  if (!isRecord(value) || !isGraphEdgeKind(value.kind)) {
    fail(`Graph edges[${index}] has an invalid kind.`);
  }
  validateId(value.from, `Graph edges[${index}].from`);
  validateId(value.to, `Graph edges[${index}].to`);
  if (value.kind === "targets-function" && value.role !== "primary") {
    fail(`Graph edges[${index}].role is invalid.`);
  }
  if (value.kind === "targets-task" && value.role !== "primary") {
    fail(`Graph edges[${index}].role is invalid.`);
  }
  if (
    (value.kind === "exposes-function" || value.kind === "exposes-event" || value.kind === "exposes-task" || value.kind === "exposes-job") &&
    !nonEmpty(value.member)
  ) {
    fail(`Graph edges[${index}].member is invalid.`);
  }
  if (
    (value.kind === "exposes-function" ||
      value.kind === "exposes-event" ||
      value.kind === "exposes-task" ||
      value.kind === "exposes-job" ||
      value.kind === "uses-middleware") &&
    (!Number.isSafeInteger(value.order) || (value.order as number) < 0)
  ) {
    fail(`Graph edges[${index}].order is invalid.`);
  }
  if (value.kind === "uses-middleware" && value.match !== "always" && value.match !== "conditional")
    fail(`Graph edges[${index}].match is invalid.`);
  if (
    value.kind === "uses-hook" &&
    !["before", "after", "start", "success", "failure"].includes(String(value.phase))
  ) {
    fail(`Graph edges[${index}].phase is invalid.`);
  }
  if (value.kind === "uses-hook") validateHookEdge(value, index, nodes);
}

function validateHookEdge(
  value: Record<string, unknown>,
  index: number,
  nodes: readonly unknown[],
): void {
  const hook = nodeFor(nodes, value.to);
  if (hook?.kind !== "hook") fail(`Graph edges[${index}].to must reference a hook node.`);
  const owner = nodeFor(nodes, hook.ownerId);
  if (owner?.kind !== hook.ownerKind)
    fail(`Graph edges[${index}] hook owner kind does not match its owner node.`);
  if (value.from !== hook.ownerId) fail(`Graph edges[${index}] must originate at its hook owner.`);
  if (value.phase !== hook.phase) fail(`Graph edges[${index}].phase does not match its hook node.`);
}

function nodeFor(nodes: readonly unknown[], id: unknown): Record<string, unknown> | undefined {
  return nodes.find(
    (node): node is Record<string, unknown> => isRecord(node) && node.id === id,
  );
}

function validateIds(value: unknown, label: string): void {
  if (!Array.isArray(value)) fail(`${label} is invalid.`);
  value.forEach((entry, index) => validateId(entry, `${label}[${index}]`));
}

function validateId(value: unknown, label: string): void {
  if (!isCanonicalId(value)) fail(`${label} is invalid.`);
}

function isCanonicalId(value: unknown): value is string {
  return isStableId(value) && !value.startsWith("unbound.");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function rejectUnboundIdentities(value: unknown, path = "graph", identityField = false): void {
  if (typeof value === "string") {
    if (identityField && value.startsWith("unbound.")) fail(`${path} is not a canonical identity.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectUnboundIdentities(entry, `${path}[${index}]`, identityField),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    rejectUnboundIdentities(child, `${path}.${key}`, isIdentityField(key));
  }
}

function isIdentityField(key: string): boolean {
  return (
    key === "id" || key === "from" || key === "to" || key.endsWith("Id") || key.endsWith("Ids")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
