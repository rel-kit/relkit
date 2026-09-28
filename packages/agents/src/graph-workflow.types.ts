import type { END, START } from "@langchain/langgraph";
import type { JsonValue } from "@relkit/contracts";

/** Serializable node entry in an agent graph workflow. */
export interface GraphWorkflowNode {
  readonly id: string;
  readonly kind: "node" | "function" | "subgraph";
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly resume?: JsonValue;
  readonly ends: readonly string[];
  readonly targetFunctionId?: string;
  readonly workflow?: GraphWorkflow;
}

/** Serializable static, join, or conditional graph edge. */
export type GraphWorkflowEdge =
  | { readonly kind: "edge"; readonly from: string; readonly to: string }
  | { readonly kind: "join"; readonly from: readonly string[]; readonly to: string }
  | {
      readonly kind: "conditional";
      readonly from: string;
      readonly routes: readonly { readonly label: string; readonly to: string }[];
      readonly dynamic: boolean;
    };

/** Immutable serializable graph topology for runtime and clients. */
export interface GraphWorkflow {
  readonly version: 1;
  readonly start: typeof START;
  readonly end: typeof END;
  readonly nodes: readonly GraphWorkflowNode[];
  readonly edges: readonly GraphWorkflowEdge[];
}
