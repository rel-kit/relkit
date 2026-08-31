import type { ApplicationGraph } from "./model.js";

/** Rejects forged graph references before any runtime or deployment registration. */
export function validateEventTargets(graph: ApplicationGraph): void {
  const functions = new Map(
    graph.nodes.filter((node) => node.kind === "function").map((node) => [node.id, node]),
  );
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const reject = (owner: string, target: string): void => {
    if (functions.get(target)?.invocationMode === "event-only") {
      throw new TypeError(
        `"${owner}" cannot target event-only function "${target}"; use a callable defineFunction.`,
      );
    }
  };
  for (const node of graph.nodes) {
    if (node.kind === "trigger" && node.triggerType === "event") {
      const config = node.config as Record<string, unknown>;
      if (
        typeof config.eventId !== "string" ||
        !Number.isSafeInteger(config.eventVersion) ||
        (config.eventVersion as number) < 1 ||
        "selector" in config ||
        "expansion" in config
      ) {
        throw new TypeError(`Event trigger "${node.id}" requires exact eventId and eventVersion.`);
      }
      if (functions.get(node.targetFunctionId)?.invocationMode !== "event-only") {
        throw new TypeError(
          `Event trigger "${node.id}" must target an event-only function, not "${node.targetFunctionId}".`,
        );
      }
      const event = nodes.get(config.eventId);
      if (event?.kind !== "event" || event.version !== config.eventVersion) {
        throw new TypeError(
          `Event trigger "${node.id}" references unknown event "${config.eventId}@${config.eventVersion}".`,
        );
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
