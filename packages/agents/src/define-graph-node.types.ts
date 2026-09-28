import type { Command, LangGraphRunnableConfig } from "@langchain/langgraph";
import type { DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { RELKIT_GRAPH_NODE } from "./graph-node-symbol.js";

type NodeUpdateInput<Schema extends StandardSchemaV1> = Extract<
  InferInput<Schema>,
  Record<string, unknown>
>;
type NodeUpdate<Schema extends StandardSchemaV1> = Extract<
  InferOutput<Schema>,
  Record<string, unknown>
>;
type CommandNodes<Ends extends readonly string[]> = Ends extends readonly []
  ? string
  : Extract<Ends[number], string>;

/** Validated graph node result or native routing command. */
export type GraphNodeResult<OutputSchema extends StandardSchemaV1, Ends extends readonly string[]> =
  NodeUpdate<OutputSchema> | Command<unknown, NodeUpdate<OutputSchema>, CommandNodes<Ends>>;

/** Validated handler stored on a graph node descriptor. */
export type GraphNodeHandler<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Ends extends readonly string[],
> = (
  input: InferOutput<InputSchema>,
  config?: LangGraphRunnableConfig,
) => MaybePromise<GraphNodeResult<OutputSchema, Ends>>;

/** User implementation before RELKIT input and output validation. */
export type GraphNodeImplementation<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Ends extends readonly string[],
> = (
  input: InferOutput<InputSchema>,
  config?: LangGraphRunnableConfig,
) => MaybePromise<
  | NodeUpdateInput<OutputSchema>
  | Command<unknown, NodeUpdateInput<OutputSchema>, CommandNodes<Ends>>
>;

/** Immutable native graph node descriptor. */
export interface GraphNodeDescriptor<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  ResumeSchema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
  Ends extends readonly string[] = readonly string[],
> extends DescriptorMetadata {
  readonly [RELKIT_GRAPH_NODE]: true;
  readonly kind: "graph-node";
  readonly id: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly resume?: ResumeSchema;
  readonly ends: Ends;
  readonly handler: GraphNodeHandler<InputSchema, OutputSchema, Ends>;
}

/** Erased graph node descriptor for runtime validation. */
export type GraphNodeAny = GraphNodeDescriptor<
  string,
  StandardSchemaV1,
  StandardSchemaV1,
  StandardSchemaV1 | undefined,
  readonly string[]
>;

/** Authoring options for a native LangGraph node. */
export interface DefineGraphNodeOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  ResumeSchema extends StandardSchemaV1 | undefined,
  Ends extends readonly string[],
> extends DescriptorMetadata {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly resume?: ResumeSchema;
  readonly ends?: Ends;
  readonly handler: GraphNodeImplementation<InputSchema, OutputSchema, Ends>;
}
