import { GRAPH_VERSION } from "@relkit/contracts";
import { isGraphEdgeKind, isGraphNodeKind } from "./model.js";
import { validateEventTargets } from "./event-validation.js";
import { isCanonicalId, nonEmpty, validateId, validateNode } from "./graph-validation-node.js";

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
    (value.kind === "exposes-function" ||
      value.kind === "exposes-event" ||
      value.kind === "exposes-task" ||
      value.kind === "exposes-job") &&
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
  return nodes.find((node): node is Record<string, unknown> => isRecord(node) && node.id === id);
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
