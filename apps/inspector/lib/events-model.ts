import type { InspectorEventRuntime, InspectorGraph, InspectorObject } from "./api-types";

export interface EventView {
  readonly event: InspectorObject;
  readonly publishers: readonly InspectorObject[];
  readonly listeners: readonly InspectorObject[];
  readonly consumers: readonly InspectorObject[];
  readonly deliveries: readonly InspectorObject[];
  readonly deadLetters: readonly InspectorObject[];
  readonly publications: readonly InspectorObject[];
}

export const EVENT_DELIVERY_STATES = [
  "available",
  "leased",
  "delayed",
  "completed",
  "dead-lettered",
] as const;

export type EventDeliveryCounts = Readonly<Record<(typeof EVENT_DELIVERY_STATES)[number], number>>;

export function eventViews(
  graph: InspectorGraph,
  runtime: InspectorEventRuntime,
): readonly EventView[] {
  const data = graphData(graph);
  return data.nodes
    .filter((node) => text(node.kind) === "event")
    .map((event) => makeView(event, data.nodes, data.edges, runtime));
}

export function eventView(
  graph: InspectorGraph,
  runtime: InspectorEventRuntime,
  id: string,
): EventView | undefined {
  return eventViews(graph, runtime).find((view) => text(view.event.id) === id);
}

export function deliveryCounts(items: readonly InspectorObject[]): EventDeliveryCounts {
  const result = Object.fromEntries(EVENT_DELIVERY_STATES.map((state) => [state, 0])) as Record<
    (typeof EVENT_DELIVERY_STATES)[number],
    number
  >;
  for (const item of items) {
    const state = text(item.state);
    if (state in result) result[state as keyof typeof result] += 1;
  }
  return result;
}

function makeView(
  event: InspectorObject,
  nodes: readonly InspectorObject[],
  edges: readonly InspectorObject[],
  runtime: InspectorEventRuntime,
): EventView {
  const id = text(event.id);
  const triggerIds = new Set(
    edges.flatMap((edge) =>
      text(edge.kind) === "listens-to-event" && text(edge.to) === id ? [text(edge.from)] : [],
    ),
  );
  const listeners = nodes.filter((node) => {
    const config = record(node.config);
    return (
      text(node.kind) === "trigger" &&
      text(node.triggerType) === "event" &&
      triggerIds.has(text(node.id)) &&
      config?.eventVersion === event.version
    );
  });
  const consumerIds = new Set(
    edges.flatMap((edge) =>
      text(edge.kind) === "targets-function" && triggerIds.has(text(edge.from))
        ? [text(edge.to)]
        : [],
    ),
  );
  const consumers = nodes.filter(
    (node) => node.kind === "function" && consumerIds.has(text(node.id)),
  );
  const publishers = edges.filter(
    (edge) => text(edge.kind) === "publishes-event" && text(edge.to) === id,
  );
  const deliveries = runtime.deliveries.filter((item) => text(item.eventId) === id);
  const deadLetters = runtime.deadLetters.filter((item) => text(item.eventId) === id);
  const publications = runtime.publications.filter((item) => text(item.eventId) === id);
  return { event, publishers, listeners, consumers, deliveries, deadLetters, publications };
}

function graphData(graph: InspectorGraph): { nodes: InspectorObject[]; edges: InspectorObject[] } {
  const source = record(graph.graph);
  return {
    nodes: records(graph.nodes ?? source?.nodes),
    edges: records(graph.edges ?? source?.edges),
  };
}

function records(value: unknown): InspectorObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): InspectorObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
