/** The request flow view: one column per stage, from the request to its response. */
import type { GraphEdge, GraphNode } from "./graph-model";
import type { AppHierarchy } from "./graph-hierarchy";
import { isRoute, nodeTitle, targetFunctionId } from "./graph-node-meta";
import { edgeVerb } from "./graph-semantics";
import { itemNode } from "./graph-views-cards";
import { dedupeEdges, viewEdge } from "./graph-views-edges";
import { finish } from "./graph-views-filters";
import {
  type FlowBuild,
  placeAccess,
  placeListeners,
  placeResponses,
  reachCalls,
} from "./graph-views-flow-steps";
import type { GraphView, ViewEdge, ViewNode, ViewOptions, ViewStage } from "./graph-views.types";

export const FLOW_STAGES: readonly ViewStage[] = [
  { id: "request", label: "Request" },
  { id: "access", label: "Access" },
  { id: "handler", label: "Handler" },
  { id: "calls", label: "Calls" },
  { id: "data", label: "Data" },
  { id: "events", label: "Events" },
  { id: "listeners", label: "Listeners" },
  { id: "realtime", label: "Realtime" },
  { id: "response", label: "Response" },
];

export function flowView(
  hierarchy: AppHierarchy,
  entryId: string,
  options: ViewOptions = {},
): GraphView | undefined {
  const entry = hierarchy.nodes.get(entryId);
  if (entry === undefined) return undefined;
  let handler: GraphNode | undefined;
  const requests: GraphNode[] = [];
  if (entry.kind === "trigger") {
    requests.push(entry);
    const target = targetFunctionId(entry);
    handler = target === undefined ? undefined : hierarchy.nodes.get(target);
  } else if (entry.kind === "function") {
    handler = entry;
    for (const edge of hierarchy.incoming.get(entry.id) ?? []) {
      if (edge.kind !== "targets-function") continue;
      const trigger = hierarchy.nodes.get(edge.from);
      if (trigger !== undefined) requests.push(trigger);
    }
  } else if (entry.kind === "tool") {
    const target = targetFunctionId(entry);
    handler = target === undefined ? undefined : hierarchy.nodes.get(target);
    requests.push(entry);
  }
  if (handler === undefined) return undefined;

  const nodes = new Map<string, ViewNode>();
  const edges: ViewEdge[] = [];
  const place = (node: GraphNode, stage: string, extra: Partial<ViewNode> = {}) => {
    if (nodes.has(node.id)) return;
    nodes.set(node.id, { ...itemNode(node, hierarchy), stage, ...extra });
  };
  const connect = (edge: GraphEdge, label = edgeVerb(edge)) =>
    edges.push({ ...viewEdge(edge), label });

  const build: FlowBuild = { hierarchy, nodes, edges, place, connect };

  for (const request of requests) place(request, "request");
  place(handler, "handler");
  const accessNotes = placeAccess(build, requests, handler);
  const reach = reachCalls(build, handler);

  const stages: ViewStage[] = FLOW_STAGES.map((stage) => ({ ...stage }));
  const stageNote = (id: string, note: string) => {
    const index = stages.findIndex((stage) => stage.id === id);
    if (index >= 0) stages[index] = { ...stages[index]!, note };
  };

  const workers = [...reach];
  for (const workerId of workers) {
    for (const edge of hierarchy.outgoing.get(workerId) ?? []) {
      if (edge.kind !== "uses-table") continue;
      const table = hierarchy.nodes.get(edge.to);
      if (table === undefined) continue;
      place(table, "data");
      connect(edge);
    }
  }
  if (!hierarchy.hasTableUsage) {
    const database = hierarchy.platform.database;
    if (database !== undefined) place(database, "data", { subtitle: "Access not recorded" });
    stageNote(
      "data",
      "This generation does not record table access. Regenerate the graph with a newer relkit to see reads and writes.",
    );
  }

  const events: GraphNode[] = [];
  for (const workerId of workers) {
    for (const edge of hierarchy.outgoing.get(workerId) ?? []) {
      if (edge.kind !== "publishes-event") continue;
      const event = hierarchy.nodes.get(edge.to);
      if (event === undefined) continue;
      if (!nodes.has(event.id)) events.push(event);
      place(event, "events");
      connect(edge);
    }
  }

  const listenerWorkers = placeListeners(build, events);

  for (const workerId of [...workers, ...listenerWorkers]) {
    for (const edge of hierarchy.outgoing.get(workerId) ?? []) {
      if (edge.kind !== "triggers-channel") continue;
      const channel = hierarchy.nodes.get(edge.to);
      if (channel === undefined) continue;
      place(channel, "realtime");
      connect(edge);
    }
  }

  const route = requests.find(isRoute);
  placeResponses(build, handler, route);

  if (accessNotes.length > 0) stageNote("access", accessNotes[0]!);
  const title =
    route !== undefined ? `${nodeTitle(route)} request flow` : `${nodeTitle(handler)} flow`;
  return finish(
    {
      mode: "flow",
      title,
      subtitle: flowSubtitle(nodes),
      focusId: entry.id,
      nodes: [...nodes.values()],
      edges: dedupeEdges(edges),
      stages: stages.filter(
        (stage) =>
          stage.note !== undefined || [...nodes.values()].some((node) => node.stage === stage.id),
      ),
      available: {},
    },
    options,
  );
}

function flowSubtitle(nodes: ReadonlyMap<string, ViewNode>): string {
  const count = (stage: string) =>
    [...nodes.values()].filter((node) => node.stage === stage).length;
  const parts = [
    `${count("calls")} calls`,
    `${count("data")} tables`,
    `${count("events")} events`,
    `${count("realtime")} channels`,
  ];
  return `${parts.join(" · ")}. In order: what the request touches before it responds.`;
}
