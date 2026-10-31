/** Stage builders for the request flow view: access checks, calls, listeners and responses. */
import type { GraphEdge, GraphNode } from "./graph-model";
import { type Access, type AppHierarchy, functionAccess, routeAccess } from "./graph-hierarchy";
import {
  functionErrors,
  functionOutput,
  isRoute,
  nodeDescription,
  nodeTitle,
  routeResponses,
  schemaSummary,
  targetFunctionId,
} from "./graph-node-meta";
import { guardNames, guardSentence, syntheticEdge, viewEdge } from "./graph-views-edges";
import type { ViewEdge, ViewNode } from "./graph-views.types";

/** The flow being assembled: nodes keyed by id, edges in order, and the helpers that add them. */
export interface FlowBuild {
  readonly hierarchy: AppHierarchy;
  readonly nodes: Map<string, ViewNode>;
  readonly edges: ViewEdge[];
  readonly place: (node: GraphNode, stage: string, extra?: Partial<ViewNode>) => void;
  readonly connect: (edge: GraphEdge, label?: string) => void;
}

const CALL_DEPTH = 4;

/**
 * Access: middleware rides on the request's first edge as a lock; the session and role checks
 * the handler declares get their own Access stage. Returns the notes for the Access stage.
 */
export function placeAccess(
  build: FlowBuild,
  requests: readonly GraphNode[],
  handler: GraphNode,
): string[] {
  const { hierarchy, edges, place } = build;
  const accessNotes: string[] = [];
  const auth = hierarchy.platform.auth;
  const placeAuth = (service: GraphNode, access: Access) => {
    const checks = [access.session ? "session required" : "", access.role ? "role checked" : ""]
      .filter((part) => part !== "")
      .join(" · ");
    place(service, "access", { subtitle: checks, badges: access.role ? ["401", "403"] : ["401"] });
  };
  // A function nothing triggers still declares its checks: show them ahead of the handler.
  if (requests.length === 0) {
    const access = functionAccess(handler);
    if ((access.session || access.role) && auth !== undefined) {
      placeAuth(auth, access);
      edges.push(syntheticEdge(auth.id, handler.id, "allows", "auth"));
      accessNotes.push("Checked inside the handler through context.auth.");
    }
    return accessNotes;
  }
  for (const request of requests) {
    const access = isRoute(request) ? routeAccess(hierarchy, request) : functionAccess(handler);
    const names = guardNames(hierarchy, access.middleware);
    const guarded = (edge: ViewEdge): ViewEdge =>
      names.length === 0 ? edge : { ...edge, guards: names, guardNote: guardSentence(names, 1, 1) };
    let previous = request.id;
    if ((access.session || access.role) && auth !== undefined) {
      placeAuth(auth, access);
      edges.push(guarded(syntheticEdge(previous, auth.id, "checks session", "auth")));
      previous = auth.id;
      accessNotes.push(
        names.length > 0
          ? `Passes through ${names.join(" → ")} first; the handler checks the session through context.auth.`
          : "Checked inside the handler through context.auth.",
      );
    }
    if (previous === request.id) {
      const edge = entryEdge(hierarchy, request, handler);
      if (edge !== undefined) edges.push(guarded(edge));
    } else {
      edges.push(syntheticEdge(previous, handler.id, "allows", "auth"));
    }
  }
  return accessNotes;
}

/** The arrow from a request to its handler: a trigger's target, or the function a tool runs. */
function entryEdge(
  hierarchy: AppHierarchy,
  request: GraphNode,
  handler: GraphNode,
): ViewEdge | undefined {
  const target = hierarchy.outgoing
    .get(request.id)
    ?.find((item) => item.kind === "targets-function" && item.to === handler.id);
  if (target !== undefined) return { ...viewEdge(target), label: "handled by" };
  // Tools are declared from the function side (function exposes-as-tool tool); read it reversed.
  const exposed = hierarchy.incoming
    .get(request.id)
    ?.find((item) => item.kind === "exposes-as-tool" && item.from === handler.id);
  if (exposed !== undefined)
    return { ...viewEdge({ ...exposed, from: request.id, to: handler.id }), label: "runs" };
  return undefined;
}

/** Follows calls, agents and tools from the handler; returns every function reached. */
export function reachCalls(build: FlowBuild, handler: GraphNode): Set<string> {
  const { hierarchy, place, connect } = build;
  const reach = new Set<string>([handler.id]);
  const frontier: { id: string; depth: number }[] = [{ id: handler.id, depth: 0 }];
  while (frontier.length > 0) {
    const current = frontier.shift()!;
    if (current.depth >= CALL_DEPTH) continue;
    for (const edge of hierarchy.outgoing.get(current.id) ?? []) {
      let next: GraphNode | undefined;
      if (
        edge.kind === "calls-function" ||
        edge.kind === "invokes-agent" ||
        edge.kind === "uses-tool"
      )
        next = hierarchy.nodes.get(edge.to);
      if (next === undefined) continue;
      connect(edge);
      if (reach.has(next.id)) continue;
      reach.add(next.id);
      place(next, "calls");
      frontier.push({ id: next.id, depth: current.depth + 1 });
      if (next.kind === "tool") {
        const run = hierarchy.incoming
          .get(next.id)
          ?.find((item) => item.kind === "exposes-as-tool");
        const target = run === undefined ? undefined : hierarchy.nodes.get(run.from);
        if (run !== undefined && target !== undefined) {
          connect({ ...run, from: next.id, to: target.id }, "runs");
          if (!reach.has(target.id)) {
            reach.add(target.id);
            place(target, "calls");
            frontier.push({ id: target.id, depth: current.depth + 1 });
          }
        }
      }
    }
  }
  return reach;
}

/** Places the listeners the published events wake; returns the functions that run there. */
export function placeListeners(build: FlowBuild, events: readonly GraphNode[]): string[] {
  const { hierarchy, place, connect } = build;
  const listenerWorkers: string[] = [];
  for (const event of events) {
    for (const edge of hierarchy.incoming.get(event.id) ?? []) {
      if (edge.kind !== "listens-to-event") continue;
      const trigger = hierarchy.nodes.get(edge.from);
      const targetId = trigger === undefined ? undefined : targetFunctionId(trigger);
      const target = targetId === undefined ? undefined : hierarchy.nodes.get(targetId);
      if (trigger === undefined || target === undefined) continue;
      const targetSummary = listenerSummary(hierarchy, target);
      place(target, "listeners", {
        badges: [`on ${nodeTitle(event)}`],
        ...(targetSummary === undefined ? {} : { subtitle: targetSummary }),
      });
      connect({ ...edge, from: event.id, to: target.id }, "wakes");
      listenerWorkers.push(target.id);
      for (const call of hierarchy.outgoing.get(target.id) ?? []) {
        if (call.kind !== "calls-function") continue;
        const callee = hierarchy.nodes.get(call.to);
        if (callee === undefined) continue;
        const calleeSummary = listenerSummary(hierarchy, callee);
        place(callee, "listeners", calleeSummary === undefined ? {} : { subtitle: calleeSummary });
        connect(call);
        listenerWorkers.push(callee.id);
      }
    }
  }
  return listenerWorkers;
}

/** Places what the handler answers with: the route's declared responses, or its output and errors. */
export function placeResponses(
  build: FlowBuild,
  handler: GraphNode,
  route: GraphNode | undefined,
): void {
  const { hierarchy, nodes, edges, place } = build;
  const responses = route === undefined ? [] : routeResponses(route);
  const seenErrors = new Set<string>();
  if (responses.length > 0) {
    for (const response of responses) {
      const id = `response:${response.id}`;
      if (response.kind === "error" && response.errorId !== undefined) {
        const error = hierarchy.nodes.get(response.errorId);
        if (error !== undefined) {
          seenErrors.add(error.id);
          place(error, "response", { badges: [String(response.status)] });
          edges.push(syntheticEdge(handler.id, error.id, "may fail with", "structure"));
          continue;
        }
      }
      const responseSummary = schemaSummary(response.schema);
      nodes.set(id, {
        id,
        type: "response",
        category: response.kind === "error" ? "error" : "route",
        title: `${response.status} ${responseName(response.kind, response.status)}`,
        ...(responseSummary === undefined ? {} : { subtitle: responseSummary }),
        stage: "response",
      });
      edges.push(
        syntheticEdge(
          handler.id,
          id,
          response.kind === "error" ? "may fail with" : "returns",
          "structure",
        ),
      );
    }
  } else {
    const outputSummary = schemaSummary(functionOutput(handler));
    nodes.set("response:output", {
      id: "response:output",
      type: "response",
      category: "function",
      title: "Output",
      ...(outputSummary === undefined ? {} : { subtitle: outputSummary }),
      stage: "response",
    });
    edges.push(syntheticEdge(handler.id, "response:output", "returns", "structure"));
  }
  for (const error of functionErrors(handler)) {
    if (seenErrors.has(error.id)) continue;
    const node = hierarchy.nodes.get(error.id);
    if (node === undefined) continue;
    place(node, "response", {
      ...(error.status === undefined ? {} : { badges: [String(error.status)] }),
    });
    edges.push(syntheticEdge(handler.id, node.id, "may fail with", "structure"));
  }
}

function listenerSummary(hierarchy: AppHierarchy, node: GraphNode): string | undefined {
  const parts: string[] = [];
  const writes = new Set<string>();
  const reads = new Set<string>();
  for (const edge of hierarchy.outgoing.get(node.id) ?? []) {
    if (edge.kind === "uses-table" && edge.table !== undefined)
      (edge.access === "write" ? writes : reads).add(edge.table);
  }
  if (writes.size > 0) parts.push(`writes ${[...writes].join(", ")}`);
  if (reads.size > 0) parts.push(`reads ${[...reads].join(", ")}`);
  return parts.length === 0 ? nodeDescription(node) : parts.join(" · ");
}

function responseName(kind: string, status: number): string {
  if (kind === "validation" || status === 422) return "Validation failed";
  if (status === 200) return "OK";
  if (status === 201) return "Created";
  if (status === 202) return "Accepted";
  if (status === 204) return "No content";
  return kind === "error" ? "Error" : "Success";
}
