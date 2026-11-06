import type { ServiceNode } from "../graph/index.js";

export type { ApplicationGraph, FunctionNode, GraphNode, ServiceNode } from "../graph/index.js";
export type { HttpGraphTrigger } from "./generate.types.js";

/** Mutable per-document service index; its lifetime is one generation.
 * @example const index = Effect.runSync(serviceContextEffect(graph));
 */
export interface OpenApiServiceContext {
  readonly byId: Map<string, ServiceNode>;
  readonly byFunction: Map<string, ServiceNode>;
  readonly sources: ServiceNode[];
}
