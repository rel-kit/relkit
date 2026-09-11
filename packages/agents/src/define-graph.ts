import type { AnyStateSchema, BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import {
  createDescriptorBase,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@relkit/contracts";
import type { AgentRef, FunctionGraphNodeDescriptor } from "@relkit/functions";
import { createUnboundIdentity } from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import {
  copyAgentClientPolicy,
  copyAgentControls,
  type AgentClientPolicy,
  type AgentControl,
} from "./agent-client.js";
import { assertAgentSchema, isRecord } from "./agent-validation.js";
import { copyAgentLimits, type AgentLimits } from "./define-agent.js";
import type { GraphNodeAny } from "./define-graph-node.js";
import { prepareGraphDefinition } from "./graph-definition.js";
import type { GraphEdgeBuilder, GraphEdgeOperation } from "./graph-edges.js";
import { graphWorkflow, type GraphWorkflow } from "./graph-workflow.js";
import type { CheckpointerResource, MemoryResource } from "./define-persistence.js";
import {
  graphClientContractMetadata,
  type AgentClientContractMetadata,
} from "./client-contract-metadata.js";
import {
  createSubgraphNode,
  type GraphAsNodeOptions,
  type SubgraphNodeDescriptor,
} from "./graph-subgraph.js";

export type GraphNodeLike = GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor;
export type GraphNodeId<Nodes extends readonly GraphNodeLike[]> = Nodes[number]["id"];
export type GraphState<State extends AnyStateSchema> = State["State"];
type GraphStateKey<State extends AnyStateSchema> = Extract<keyof GraphState<State>, string>;
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

const GRAPH_EXECUTION = Symbol.for("relkit.graph-execution");

export interface GraphExecution<State = any> {
  readonly state: AnyStateSchema;
  readonly operations: readonly GraphEdgeOperation<string, State>[];
  readonly checkpointer?: BaseCheckpointSaver | CheckpointerResource;
  readonly store?: BaseStore | MemoryResource;
}

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

/** Defines an inspectable RELKIT agent backed directly by native LangGraph. */
export function defineGraph<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const State extends AnyStateSchema,
  const Nodes extends readonly GraphNodeLike[],
>(
  options: DefineGraphOptions<Id, InputSchema, OutputSchema, State, Nodes>,
): GraphDescriptor<Id, InputSchema, OutputSchema, State, Nodes> {
  if (!isRecord(options)) throw new TypeError("Graph options must be an object");
  assertAgentSchema(options.input, "input");
  assertAgentSchema(options.output, "output");
  const { nodes, operations, stateKeys } = prepareGraphDefinition(
    options.state,
    options.input,
    options.output,
    options.nodes,
    options.edges as (builder: GraphEdgeBuilder<string, any>) => unknown,
  );
  const limits = copyAgentLimits(options.limits);
  const client = copyAgentClientPolicy(options.client, stateKeys as Set<GraphStateKey<State>>);
  if (client !== undefined && options.stateProfile === undefined) {
    throw new TypeError("Client-exposed graphs require stateProfile");
  }
  const stateProfile =
    options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
  const controls = copyAgentControls(options.controls);
  const id = (options.id === undefined ? createUnboundIdentity() : options.id) as Id;
  const workflow = graphWorkflow(nodes, operations);
  const descriptor = {
    ...createDescriptorBase("agent", id, options),
    execution: "graph" as const,
    input: options.input,
    output: options.output,
    nodes,
    workflow,
    instructions: "" as const,
    tools: Object.freeze([]) as readonly [],
    middleware: Object.freeze([]) as readonly [],
    limits,
    ...(stateProfile === undefined ? {} : { stateProfile }),
    ...(client === undefined ? {} : { client }),
    ...(controls === undefined ? {} : { controls }),
    clientContract: graphClientContractMetadata({
      id,
      state: options.state,
      ...(client === undefined ? {} : { client }),
      workflow,
    }),
  };
  Object.defineProperty(descriptor, GRAPH_EXECUTION, {
    value: Object.freeze({
      state: options.state,
      operations,
      ...(options.checkpointer === undefined ? {} : { checkpointer: options.checkpointer }),
      ...(options.store === undefined ? {} : { store: options.store }),
    }),
    enumerable: false,
  });
  Object.defineProperty(descriptor, "asGraphNode", {
    value: (nodeOptions?: GraphAsNodeOptions) =>
      createSubgraphNode(descriptor as unknown as GraphDescriptor, nodeOptions),
    enumerable: false,
  });
  return Object.freeze(descriptor) as unknown as GraphDescriptor<
    Id,
    InputSchema,
    OutputSchema,
    State,
    Nodes
  >;
}

export function graphExecution(value: GraphDescriptor): GraphExecution {
  return value[GRAPH_EXECUTION];
}

export function isGraphDescriptor(value: unknown): value is GraphDescriptor {
  return (
    isRecord(value) &&
    value.execution === "graph" &&
    value.kind === "agent" &&
    value[GRAPH_EXECUTION] !== undefined
  );
}

export type GraphInput<Graph extends GraphDescriptor> = InferInput<Graph["input"]>;
export type GraphOutput<Graph extends GraphDescriptor> = InferOutput<Graph["output"]>;
