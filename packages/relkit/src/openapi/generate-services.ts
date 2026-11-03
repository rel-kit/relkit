import { Effect } from "effect";
import { observeOpenApi } from "./generate-observability.js";
import type {
  ApplicationGraph,
  FunctionNode,
  GraphNode,
  HttpGraphTrigger,
  OpenApiServiceContext,
  ServiceNode,
} from "./generate-services.types.js";

/** Index declared and explicit synthetic services for one graph.
 * @param graph - Source application graph.
 * @returns Effect containing an isolated mutable service index; no expected failure.
 * @example Effect.runSync(serviceContextEffect(graph));
 */
export const serviceContextEffect = Effect.fn("OpenApi.serviceContext")((graph: ApplicationGraph) =>
  observeOpenApi(
    "services.index",
    Effect.sync((): OpenApiServiceContext => {
      const sources = graph.nodes.filter(isServiceNode);
      const byId = new Map(sources.map((service) => [service.id, service]));
      const byFunction = new Map<string, ServiceNode>();
      for (const service of sources)
        for (const member of service.functions) byFunction.set(member.functionId, service);
      for (const node of graph.nodes)
        if (node.kind === "function") registerExplicitService(node, byId, byFunction, sources);
      return { byId, byFunction, sources };
    }),
  ),
);

/** Resolve or create the service owning an HTTP function.
 * @param context - Per-document service index.
 * @param trigger - HTTP trigger with optional explicit service ID.
 * @param target - Target function.
 * @returns Effect containing the owning service or undefined; no expected failure.
 * @example Effect.runSync(serviceForEffect(context, trigger, target));
 */
export const serviceForEffect = Effect.fn("OpenApi.serviceFor")(
  (
    context: OpenApiServiceContext,
    trigger: HttpGraphTrigger,
    target: FunctionNode,
  ): Effect.Effect<ServiceNode | undefined> =>
    observeOpenApi(
      "services.resolve",
      Effect.sync(() => {
        const memberService = context.byFunction.get(target.id);
        if (memberService !== undefined) return memberService;
        const id = serviceId(trigger);
        if (id === undefined) return undefined;
        const existing = context.byId.get(id);
        if (existing !== undefined) return existing;
        const service = syntheticService(id, trigger.source);
        context.byId.set(id, service);
        context.byFunction.set(target.id, service);
        context.sources.push(service);
        return service;
      }),
    ),
);

/** Narrow graph nodes to declared service nodes. */
function isServiceNode(node: GraphNode): node is ServiceNode {
  return node.kind === "service";
}

/** Register function service IDs absent from declared service membership. */
function registerExplicitService(
  node: FunctionNode,
  byId: Map<string, ServiceNode>,
  byFunction: Map<string, ServiceNode>,
  sources: ServiceNode[],
): void {
  const id = serviceId(node);
  if (id === undefined || byFunction.has(node.id)) return;
  const service = byId.get(id) ?? syntheticService(id, node.source);
  byId.set(id, service);
  byFunction.set(node.id, service);
  if (!sources.some((entry) => entry.id === id)) sources.push(service);
}

/** Create a documentation-only service for explicit graph metadata. */
function syntheticService(id: string, source: ServiceNode["source"]): ServiceNode {
  return { kind: "service", id, source, functions: [], events: [] };
}

/** Read a non-empty explicit service ID from graph metadata. */
function serviceId(value: FunctionNode | HttpGraphTrigger): string | undefined {
  const id = "serviceId" in value ? value.serviceId : undefined;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
