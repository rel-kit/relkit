import type { AnyStateSchema, BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { AgentRef, FunctionGraphNodeDescriptor } from "@relkit/functions";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { AgentClientPolicy, AgentControl } from "./agent-client.js";
import type { AgentLimits } from "./define-agent.types.js";
import type { GraphNodeAny } from "./define-graph-node.js";
import type { GraphEdgeBuilder, GraphEdgeOperation } from "./graph-edges.js";
import type { GraphWorkflow } from "./graph-workflow.types.js";
import type { CheckpointerResource, MemoryResource } from "./define-persistence.types.js";
import type { AgentClientContractMetadata } from "./client-contract-metadata.js";
import type { GraphAsNodeOptions, SubgraphNodeDescriptor } from "./graph-subgraph.js";
import type { GRAPH_EXECUTION } from "./graph-execution-symbol.js";

/** Authored node accepted by a graph descriptor. */
export type GraphNodeLike = GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor;

/** ID union of a graph's authored nodes. */
export type GraphNodeId<Nodes extends readonly GraphNodeLike[]> = Nodes[number]["id"];

/** State value inferred from a LangGraph StateSchema. */
export type GraphState<State extends AnyStateSchema> = State["State"];

/** Public state keys selected from a LangGraph StateSchema. */
export type GraphStateKey<State extends AnyStateSchema> = Extract<keyof GraphState<State>, string>;

type UniqueNodes<
  Nodes extends readonly GraphNodeLike[],
  Seen extends string = never,
> = number extends Nodes["length"]
  ? Nodes
  : Nodes extends readonly [infer Head extends GraphNodeLike, ...infer Tail extends GraphNodeLike[]]
    ? Head["id"] extends Seen
      ? never
      : UniqueNodes<Tail, Seen | Head["id"]> extends never
        ? never
        : Nodes
    : Nodes;

/** Runtime state and persistence declarations hidden on a graph descriptor. */
export interface GraphExecution<State = any> {
  readonly state: AnyStateSchema;
  readonly operations: readonly GraphEdgeOperation<string, State>[];
  readonly checkpointer?: BaseCheckpointSaver | CheckpointerResource;
  readonly store?: BaseStore | MemoryResource;
}

/** Inspectable agent descriptor backed by a native LangGraph graph. */
export interface GraphDescriptor<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  State extends AnyStateSchema = AnyStateSchema,
  Nodes extends readonly GraphNodeLike[] = readonly GraphNodeLike[],
>
  extends DescriptorBase<"agent", Id>, AgentRef<Id, InputSchema, OutputSchema> {
  readonly execution: "graph";
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly nodes: Nodes;
  readonly workflow: GraphWorkflow;
  readonly instructions: "";
  readonly tools: readonly [];
  readonly middleware: readonly [];
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<(...args: any[]) => unknown, GraphStateKey<State>>;
  readonly controls?: readonly AgentControl[];
  readonly clientContract: AgentClientContractMetadata;
  readonly [GRAPH_EXECUTION]: GraphExecution<GraphState<State>>;
  readonly asGraphNode: <const NodeId extends string = Id>(
    options?: GraphAsNodeOptions<NodeId>,
  ) => SubgraphNodeDescriptor<NodeId, InputSchema, OutputSchema>;
}

/** Authoring options for a native LangGraph agent descriptor. */
export interface DefineGraphOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  State extends AnyStateSchema,
  Nodes extends readonly GraphNodeLike[],
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly state: State;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly nodes: Nodes & UniqueNodes<Nodes>;
  readonly edges: (
    graph: GraphEdgeBuilder<NoInfer<Extract<GraphNodeId<Nodes>, string>>, GraphState<State>>,
  ) => unknown;
  readonly limits: AgentLimits;
  readonly stateProfile?: string;
  readonly client?: AgentClientPolicy<(...args: any[]) => unknown, GraphStateKey<State>>;
  readonly controls?: readonly AgentControl[];
  readonly checkpointer?: BaseCheckpointSaver | CheckpointerResource;
  readonly store?: BaseStore | MemoryResource;
}

/** Input inferred from a graph descriptor. */
export type GraphInput<Graph extends GraphDescriptor> = InferInput<Graph["input"]>;

/** Output inferred from a graph descriptor. */
export type GraphOutput<Graph extends GraphDescriptor> = InferOutput<Graph["output"]>;
