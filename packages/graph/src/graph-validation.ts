import { isStableId, normalizeSourceLocation } from "@zsys/contracts";
import { isGraphEdgeKind, isGraphNodeKind } from "./model.js";
import { validateProviderNode } from "./provider-validation.js";

export function validateGraphShape(value: unknown, root?: string): void {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail("A graph must contain nodes and edges arrays.");
  }
  rejectUnboundIdentities(value);
  if (value.appId !== undefined && !isCanonicalId(value.appId)) fail("Graph appId is invalid.");
  value.nodes.forEach((node, index) => validateNode(node, root, index));
  value.edges.forEach((edge, index) => validateEdge(edge, index));
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
  if (value.kind === "function") validateGenerated(value.generated, index, "generated");
  if (value.kind === "agent") {
    validateIds(value.toolIds, `Graph nodes[${index}].toolIds`);
    validateGenerated(value.generatedFunction, index, "generatedFunction");
  }
  if (value.kind === "trigger" && value.triggerType === "http") {
    validateHttpIdentities(value.config, index);
  }
  if (value.kind === "service") validateService(value, index);
  if (value.kind === "provider") validateProviderNode(value, index, fail);
  if (value.kind === "middleware") {
    if (typeof value.path !== "string" || !Number.isSafeInteger(value.order)) {
      fail(`Graph nodes[${index}] middleware metadata is invalid.`);
    }
  }
  if (value.kind === "hook") {
    validateId(value.ownerId, `Graph nodes[${index}].ownerId`);
    if (!(value.ownerKind === "function" || value.ownerKind === "tool")) {
      fail(`Graph nodes[${index}].ownerKind is invalid.`);
    }
    if (!(value.phase === "before" || value.phase === "after")) {
      fail(`Graph nodes[${index}].phase is invalid.`);
    }
  }
}

function validateGenerated(value: unknown, index: number, field: string): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) fail(`Graph nodes[${index}].${field} is invalid.`);
  for (const key of ["agentId", "listenerId", "functionId"] as const) {
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

function validateService(value: Record<string, unknown>, index: number): void {
  if (!Array.isArray(value.members) || value.members.length === 0) {
    fail(`Graph nodes[${index}].members must be a non-empty array.`);
  }
  const names = new Set<string>();
  value.members.forEach((member, memberIndex) => {
    if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name)) {
      fail(`Graph nodes[${index}].members[${memberIndex}] is invalid.`);
    }
    names.add(member.name);
    validateId(member.functionId, `Graph nodes[${index}].members[${memberIndex}].functionId`);
  });
  if (!Array.isArray(value.middleware)) fail(`Graph nodes[${index}].middleware must be an array.`);
  value.middleware.forEach((entry, middlewareIndex) => {
    if (!isRecord(entry)) fail(`Graph nodes[${index}].middleware[${middlewareIndex}] is invalid.`);
    validateId(entry.id, `Graph nodes[${index}].middleware[${middlewareIndex}].id`);
  });
  if (value.tags !== undefined && !textArray(value.tags))
    fail(`Graph nodes[${index}].tags is invalid.`);
  for (const field of ["title", "description"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      fail(`Graph nodes[${index}].${field} is invalid.`);
    }
  }
}

function validateEdge(value: unknown, index: number): void {
  if (!isRecord(value) || !isGraphEdgeKind(value.kind)) {
    fail(`Graph edges[${index}] has an invalid kind.`);
  }
  validateId(value.from, `Graph edges[${index}].from`);
  validateId(value.to, `Graph edges[${index}].to`);
  if (value.kind === "targets-function" && value.role !== "primary") {
    fail(`Graph edges[${index}].role is invalid.`);
  }
  if (value.kind === "contains-function" && !nonEmpty(value.member)) {
    fail(`Graph edges[${index}].member is invalid.`);
  }
  if (
    (value.kind === "contains-function" ||
      value.kind === "uses-service-middleware" ||
      value.kind === "uses-middleware") &&
    (!Number.isSafeInteger(value.order) || (value.order as number) < 0)
  ) {
    fail(`Graph edges[${index}].order is invalid.`);
  }
  if (value.kind === "uses-middleware" && value.match !== "always" && value.match !== "conditional")
    fail(`Graph edges[${index}].match is invalid.`);
  if (value.kind === "uses-hook" && value.phase !== "before" && value.phase !== "after") {
    fail(`Graph edges[${index}].phase is invalid.`);
  }
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

function textArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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
