import { GRAPH_VERSION } from "@relkit/contracts";
import { Effect } from "effect";
import { validateEventTargetsEffect, GraphEventTargetsError } from "./event-validation.js";
import {
  attemptValidation,
  failValidation,
  GraphValidationError,
} from "./graph-validation-error.js";
import { observeGraph, runGraph } from "./graph-observability.js";
import { isGraphEdgeKind, isGraphNodeKind } from "./model.js";
import {
  isCanonicalId,
  nonEmpty,
  validateId,
  validateNodeEffect,
} from "./graph-validation-node.js";
import type { ApplicationGraph } from "./model.js";
/**
 * Validates a graph's version, identities, nodes, edges, and event targets.
 * @param value - Candidate graph document.
 * @param root - Optional project root for source paths.
 * @returns An Effect that succeeds with void or fails with a tagged graph or event error.
 * @example Effect.runSync(validateGraphShapeEffect(graph));
 */
export function validateGraphShapeEffect(
  value: unknown,
  root?: string,
): Effect.Effect<void, GraphValidationError | GraphEventTargetsError> {
  return observeGraph(
    "validation.graph",
    Effect.gen(function* () {
      const graph = yield* attemptValidation("validation.graph", () => checkGraphShape(value));
      for (const [index, node] of graph.nodes.entries())
        yield* validateNodeEffect(node, root, index);
      for (const [index, edge] of graph.edges.entries())
        yield* attemptValidation("validation.graph", () => validateEdge(edge, index, graph.nodes));
      yield* validateEventTargetsEffect(value as ApplicationGraph);
    }),
  );
}
/**
 * Synchronous compatibility adapter for full graph validation.
 * @param value - Candidate graph document.
 * @param root - Optional project root for source paths.
 * @returns Void when the graph is valid.
 * @throws TypeError for invalid graph structure or event targeting.
 * @example validateGraphShape(graph);
 */
export function validateGraphShape(value: unknown, root?: string): void {
  try {
    return runGraph(validateGraphShapeEffect(value, root));
  } catch (error) {
    if (error instanceof GraphValidationError || error instanceof GraphEventTargetsError)
      throw new TypeError(error.message);
    throw error;
  }
}
function checkGraphShape(value: unknown): {
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
} {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail("A graph must contain nodes and edges arrays.");
  }
  if (value.contractVersion !== GRAPH_VERSION)
    fail(
      `Graph contract version ${String(value.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Regenerate with \`relkit check\`.`,
    );
  rejectUnboundIdentities(value);
  if (value.appId !== undefined && !isCanonicalId(value.appId)) fail("Graph appId is invalid.");
  return { nodes: value.nodes, edges: value.edges };
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
  return failValidation(message);
}
