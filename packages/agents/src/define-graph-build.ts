import type { AnyStateSchema } from "@langchain/langgraph";
import { createDescriptorBase, normalizeId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { copyAgentClientPolicy, copyAgentControls } from "./agent-client.js";
import { assertAgentSchema } from "./agent-validation.js";
import { copyAgentLimits } from "./define-agent.js";
import { prepareGraphDefinition } from "./graph-definition.js";
import type { GraphEdgeBuilder } from "./graph-edges.js";
import { graphWorkflow } from "./graph-workflow.js";
import { graphClientContractMetadata } from "./client-contract-metadata.js";
import { createSubgraphNode, type GraphAsNodeOptions } from "./graph-subgraph.js";
import { GRAPH_EXECUTION } from "./graph-execution-symbol.js";
import type { DefineGraphOptions, GraphDescriptor, GraphNodeLike, GraphState, GraphStateKey } from "./define-graph.types.js";

/** Validates graph authoring options and returns an assembler for its identity.
 * @param options - Graph state, nodes, edges, limits, and client policy.
 * @returns A function that constructs a frozen descriptor from its identity.
 * @throws Invalid schema, node, edge, or client policy errors.
 * @example prepareGraphDescriptor(options)("support.graph");
 */
export function prepareGraphDescriptor<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const State extends AnyStateSchema,
  const Nodes extends readonly GraphNodeLike[],
>(
  options: DefineGraphOptions<Id, InputSchema, OutputSchema, State, Nodes>,
): (id: Id) => GraphDescriptor<Id, InputSchema, OutputSchema, State, Nodes> {
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
  const stateProfile = options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
  const controls = copyAgentControls(options.controls);
  const workflow = graphWorkflow(nodes, operations);

  return (id: Id) => {
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
      Id, InputSchema, OutputSchema, State, Nodes
    >;
  };
}
