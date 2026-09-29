import type { FunctionNode, GraphNode, HttpTriggerConfig } from "@relkit/graph";

/** One decoded request mapping leaf.
 * @example const leaf: MappingLeaf = { inputPath: ["id"], outputPath: ["id"], kind: "path", optional: false, defaulted: false };
 */
export interface MappingLeaf {
  readonly inputPath: readonly string[];
  readonly outputPath: readonly string[];
  readonly kind: string;
  readonly name?: string;
  readonly value?: unknown;
  readonly optional: boolean;
  readonly defaulted: boolean;
}

/** An HTTP response available to a generated route.
 * @example const response: ResponseContract = { id: "success.200", kind: "success", status: 200 };
 */
export interface ResponseContract {
  readonly id: string;
  readonly kind: string;
  readonly status: number;
  readonly errorId?: string;
  readonly schema?: unknown;
}

/** Resolved HTTP trigger with its function and request/response metadata.
 * @example const route: ClientRoute = clientRoutes(graph)[0]!;
 */
export interface ClientRoute {
  readonly trigger: HttpGraphTrigger;
  readonly target: FunctionNode;
  readonly fields: readonly MappingLeaf[];
  readonly responses: readonly ResponseContract[];
}

/** Internal HTTP trigger shape after graph filtering.
 * @example const trigger: HttpGraphTrigger = clientRoutes(graph)[0]!.trigger;
 */
export type HttpGraphTrigger = Extract<GraphNode, { readonly kind: "trigger" }> & {
  readonly triggerType: "http";
  readonly config: HttpTriggerConfig;
};
export type { ApplicationGraph, FunctionNode } from "@relkit/graph";
export type { InputTree } from "./input-tree.types.js";
