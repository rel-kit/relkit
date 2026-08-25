import type { ApplicationGraph, FunctionNode, GraphNode, ServiceNode } from "@zsys/graph";
import type { HttpGraphTrigger } from "./generate.js";

export interface OpenApiServiceContext {
  readonly byId: Map<string, ServiceNode>;
  readonly byFunction: Map<string, ServiceNode>;
  readonly sources: ServiceNode[];
}

export function serviceContext(graph: ApplicationGraph): OpenApiServiceContext {
  const sources = graph.nodes.filter(isServiceNode);
  const byId = new Map(sources.map((service) => [service.id, service]));
  const byFunction = new Map<string, ServiceNode>();
  for (const service of sources)
    for (const member of service.members) byFunction.set(member.functionId, service);
  for (const node of graph.nodes)
    if (node.kind === "function") registerExplicitService(node, byId, byFunction, sources);
  return { byId, byFunction, sources };
}

export function serviceFor(
  context: OpenApiServiceContext,
  trigger: HttpGraphTrigger,
  target: FunctionNode,
): ServiceNode | undefined {
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
}

function isServiceNode(node: GraphNode): node is ServiceNode {
  return node.kind === "service";
}

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

function syntheticService(id: string, source: ServiceNode["source"]): ServiceNode {
  return { kind: "service", id, source, members: [], middleware: [] };
}

function serviceId(value: unknown): string | undefined {
  const id = (value as { readonly serviceId?: unknown }).serviceId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
