import type { ServiceNode } from "@relkit/graph";

export type { ApplicationGraph, FunctionNode, GraphNode, ServiceNode } from "@relkit/graph";
export type { HttpGraphTrigger } from "./generate.types.js";

/** Mutable per-document service index; its lifetime is one generation.
 * @example const index = Effect.runSync(serviceContextEffect(graph));
 */
export interface OpenApiServiceContext {
  readonly byId: Map<string, ServiceNode>;
  readonly byFunction: Map<string, ServiceNode>;
  readonly sources: ServiceNode[];
}
