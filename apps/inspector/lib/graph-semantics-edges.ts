/** Edge semantics: the family, verbs and visibility of each edge kind. */
import type { GraphEdge } from "./graph-model";

/** Semantic family of an edge; each family has one colour token. */
export type EdgeGroup =
  "structure" | "invoke" | "auth" | "data" | "event" | "realtime" | "ai" | "platform";

export interface EdgeSemantics {
  readonly group: EdgeGroup;
  /** Verb phrase read from `from` to `to`. */
  readonly label: string;
  /** Verb phrase read from `to` back to `from`. */
  readonly reverse: string;
  /** Not drawn as a line on the canvas (still listed in the inspector). */
  readonly hidden?: boolean;
}

export const EDGE_SEMANTICS: Readonly<Record<string, EdgeSemantics>> = {
  "targets-function": { group: "invoke", label: "handled by", reverse: "handles" },
  "targets-task": { group: "invoke", label: "runs", reverse: "run by" },
  "calls-function": { group: "invoke", label: "calls", reverse: "called by" },
  "invokes-agent": { group: "ai", label: "asks", reverse: "asked by" },
  "uses-tool": { group: "ai", label: "uses tool", reverse: "used by" },
  "exposes-as-tool": { group: "ai", label: "exposed as", reverse: "runs" },
  "uses-table": { group: "data", label: "uses", reverse: "used by" },
  "uses-bucket": { group: "data", label: "stores in", reverse: "stores" },
  "uses-cache": { group: "data", label: "caches in", reverse: "caches" },
  "publishes-event": { group: "event", label: "publishes", reverse: "published by" },
  "listens-to-event": { group: "event", label: "listens to", reverse: "wakes" },
  "enqueues-job": { group: "event", label: "enqueues", reverse: "enqueued by" },
  "triggers-job": { group: "event", label: "triggers", reverse: "triggered by" },
  "triggers-task": { group: "event", label: "triggers", reverse: "triggered by" },
  "triggers-channel": { group: "realtime", label: "pushes to", reverse: "pushed by" },
  "exposes-function": { group: "structure", label: "exposes", reverse: "belongs to" },
  "exposes-event": { group: "structure", label: "declares", reverse: "declared by" },
  "exposes-task": { group: "structure", label: "exposes", reverse: "belongs to" },
  "exposes-job": { group: "structure", label: "exposes", reverse: "belongs to" },
  "depends-on-service": { group: "structure", label: "depends on", reverse: "needed by" },
  "mounts-service": { group: "structure", label: "mounts", reverse: "mounted at" },
  "uses-middleware": { group: "auth", label: "guarded by", reverse: "guards" },
  "uses-hook": { group: "structure", label: "hooks", reverse: "hooked by" },
  "declares-error": {
    group: "structure",
    label: "may fail with",
    reverse: "raised by",
    hidden: true,
  },
  "uses-provider-profile": {
    group: "platform",
    label: "runs on",
    reverse: "backs",
    hidden: true,
  },
  "provides-resource": { group: "platform", label: "provides", reverse: "provided by" },
};

const fallbackSemantics: EdgeSemantics = {
  group: "structure",
  label: "relates to",
  reverse: "related to",
};

export function edgeSemantics(kind: string): EdgeSemantics {
  return EDGE_SEMANTICS[kind] ?? EDGE_SEMANTICS[kind.split(":", 1)[0] ?? kind] ?? fallbackSemantics;
}

export function edgeGroup(edge: GraphEdge): EdgeGroup {
  return edgeSemantics(edge.kind).group;
}

/** Human label for an edge read from its source: "writes trips", "publishes". */
export function edgeVerb(edge: GraphEdge): string {
  if (edge.kind === "uses-table") {
    const verb = edge.access === "write" ? "writes" : edge.access === "read" ? "reads" : "uses";
    return edge.table === undefined ? verb : `${verb} ${edge.table}`;
  }
  return edgeSemantics(edge.kind).label;
}

/** Human label for an edge read from its target: "called by", "written by". */
export function edgeReverseVerb(edge: GraphEdge): string {
  if (edge.kind === "uses-table")
    return edge.access === "write" ? "written by" : edge.access === "read" ? "read by" : "used by";
  return edgeSemantics(edge.kind).reverse;
}

export function isHiddenEdge(edge: GraphEdge): boolean {
  return edgeSemantics(edge.kind).hidden === true;
}

export const EDGE_GROUP_LABELS: Readonly<Record<EdgeGroup, string>> = {
  structure: "Structure",
  invoke: "Calls",
  auth: "Access",
  data: "Data",
  event: "Events",
  realtime: "Realtime",
  ai: "AI",
  platform: "Platform",
};
