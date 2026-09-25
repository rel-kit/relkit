import { Data, Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { ApplicationGraph } from "./model.js";

/**
 * Tagged failure for a forged or incompatible graph event target.
 * @example Effect.catchTag("GraphEventTargetsError", (error) => Effect.logWarning(error.message));
 */
export class GraphEventTargetsError extends Data.TaggedError("GraphEventTargetsError")<{
  readonly message: string;
  readonly ownerId?: string;
  readonly targetId?: string;
}> {}

/**
 * Validates event-only function targeting and exact event triggers.
 * @param graph - Application graph whose nodes and declared edges are checked.
 * @returns An Effect that succeeds with void or fails with GraphEventTargetsError.
 * @example Effect.runSync(validateEventTargetsEffect(graph));
 */
export function validateEventTargetsEffect(
  graph: ApplicationGraph,
): Effect.Effect<void, GraphEventTargetsError> {
  return observeGraph(
    "validation.event-targets",
    Effect.try({
      try: () => checkEventTargets(graph),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof GraphEventTargetsError ? Effect.fail(error) : Effect.die(error),
      ),
    ),
  );
}

/**
 * Synchronous compatibility adapter for event target validation.
 * @param graph - Application graph whose nodes and declared edges are checked.
 * @returns Void when event references are valid.
 * @throws TypeError when a target is forged or incompatible.
 * @example validateEventTargets(graph);
 */
export function validateEventTargets(graph: ApplicationGraph): void {
  try {
    return runGraph(validateEventTargetsEffect(graph));
  } catch (error) {
    if (error instanceof GraphEventTargetsError) throw new TypeError(error.message);
    throw error;
  }
}

function checkEventTargets(graph: ApplicationGraph): void {
  const functions = new Map(
    graph.nodes.filter((node) => node.kind === "function").map((node) => [node.id, node]),
  );
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const reject = (owner: string, target: string): void => {
    if (functions.get(target)?.invocationMode === "event-only") {
      throw new GraphEventTargetsError({
        ownerId: owner,
        targetId: target,
        message: `"${owner}" cannot target event-only function "${target}"; use a callable defineFunction.`,
      });
    }
  };
  for (const node of graph.nodes) {
    if (node.kind === "trigger" && node.triggerType === "event") {
      if (node.config === null || typeof node.config !== "object" || Array.isArray(node.config)) {
        throw new GraphEventTargetsError({
          ownerId: node.id,
          message: `Event trigger "${node.id}" requires exact eventId and eventVersion.`,
        });
      }
      const config = node.config as Record<string, unknown>;
      if (
        typeof config.eventId !== "string" ||
        !Number.isSafeInteger(config.eventVersion) ||
        (config.eventVersion as number) < 1 ||
        "selector" in config ||
        "expansion" in config
      ) {
        throw new GraphEventTargetsError({
          ownerId: node.id,
          message: `Event trigger "${node.id}" requires exact eventId and eventVersion.`,
        });
      }
      if (functions.get(node.targetFunctionId)?.invocationMode !== "event-only") {
        throw new GraphEventTargetsError({
          ownerId: node.id,
          targetId: node.targetFunctionId,
          message: `Event trigger "${node.id}" must target an event-only function, not "${node.targetFunctionId}".`,
        });
      }
      const event = nodes.get(config.eventId);
      if (event?.kind !== "event" || event.version !== config.eventVersion) {
        throw new GraphEventTargetsError({
          ownerId: node.id,
          targetId: config.eventId,
          message: `Event trigger "${node.id}" references unknown event "${config.eventId}@${config.eventVersion}".`,
        });
      }
    } else if ("targetFunctionId" in node) reject(node.id, node.targetFunctionId);
    if (node.kind === "service")
      for (const member of node.functions) reject(node.id, member.functionId);
    if (node.kind === "agent") for (const target of node.toolIds) reject(node.id, target);
  }
  for (const edge of graph.edges) {
    if (
      !["calls-function", "targets-function", "exposes-function", "exposes-as-tool"].includes(
        edge.kind,
      )
    )
      continue;
    const source = nodes.get(edge.from);
    if (edge.kind === "exposes-as-tool") reject(edge.to, edge.from);
    else if (!(source?.kind === "trigger" && source.triggerType === "event"))
      reject(edge.from, edge.to);
  }
}
