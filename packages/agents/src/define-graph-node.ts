import { Command, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { normalizeId, type DescriptorMetadata, type MaybePromise } from "@relkit/contracts";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import { assertAgentSchema, isAgentSchema, isRecord } from "./agent-validation.js";
import {
  copyGraphNodeEnds,
  validateGraphNodeResult,
  validatedGraphNodeInput,
} from "./graph-node-validation.js";

export { assertGraphNodeDestinations } from "./graph-node-validation.js";

const RELKIT_GRAPH_NODE = Symbol.for("relkit.graph-node");

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

export type GraphNodeResult<OutputSchema extends StandardSchemaV1, Ends extends readonly string[]> =
  NodeUpdate<OutputSchema> | Command<unknown, NodeUpdate<OutputSchema>, CommandNodes<Ends>>;

export type GraphNodeHandler<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Ends extends readonly string[],
> = (
  input: InferOutput<InputSchema>,
  config?: LangGraphRunnableConfig,
) => MaybePromise<GraphNodeResult<OutputSchema, Ends>>;

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

export type GraphNodeAny = GraphNodeDescriptor<
  string,
  StandardSchemaV1,
  StandardSchemaV1,
  StandardSchemaV1 | undefined,
  readonly string[]
>;

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

/** Defines a native LangGraph node with RELKIT schemas and declared dynamic routes. */
export function defineGraphNode<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const ResumeSchema extends StandardSchemaV1 | undefined = undefined,
  const Ends extends readonly string[] = readonly [],
>(
  options: DefineGraphNodeOptions<Id, InputSchema, OutputSchema, ResumeSchema, Ends>,
): GraphNodeDescriptor<Id, InputSchema, OutputSchema, ResumeSchema, Ends> {
  if (!isRecord(options)) throw new TypeError("Graph node options must be an object");
  assertAgentSchema(options.input, "input");
  assertAgentSchema(options.output, "output");
  if (options.resume !== undefined) assertAgentSchema(options.resume, "resume");
  if (typeof options.handler !== "function") throw new TypeError("Graph node handler is required");

  const id = normalizeId(options.id) as unknown as Id;
  const ends = copyGraphNodeEnds(options.ends) as unknown as Ends;
  const implementation = options.handler;
  const handler: GraphNodeHandler<InputSchema, OutputSchema, Ends> = async (input, config) => {
    const projectedInput = await validatedGraphNodeInput(options.input, input);
    const result = await implementation(projectedInput, config);
    return validateGraphNodeResult(options.output, ends, result);
  };
  return Object.freeze({
    [RELKIT_GRAPH_NODE]: true as const,
    kind: "graph-node" as const,
    id,
    input: options.input,
    output: options.output,
    ...(options.resume === undefined ? {} : { resume: options.resume }),
    ends,
    handler,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
  });
}

export function isGraphNodeDescriptor(value: unknown): value is GraphNodeAny {
  return (
    isRecord(value) &&
    value[RELKIT_GRAPH_NODE] === true &&
    value.kind === "graph-node" &&
    typeof value.id === "string" &&
    Array.isArray(value.ends) &&
    value.ends.every((destination) => typeof destination === "string") &&
    isAgentSchema(value.input) &&
    isAgentSchema(value.output) &&
    (value.resume === undefined || isAgentSchema(value.resume)) &&
    typeof value.handler === "function"
  );
}
