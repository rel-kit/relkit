/** Assembles graph nodes, edges, state and persistence into the authored native descriptor that compilation consumes without invoking graph nodes. */

import type { AnyStateSchema } from "@langchain/langgraph";
import { createDescriptorBase, normalizeId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { copyAgentClientPolicy, copyAgentControls } from "@relkit/agents/internal/agent-client";
import { assertAgentSchema } from "@relkit/agents/internal/agent-validation";
import { copyAgentLimits } from "./define-agent.js";
import { prepareGraphDefinition } from "./graph-definition.js";
import type { GraphEdgeBuilder } from "./graph-edges.js";
import { graphWorkflow } from "./graph-workflow.js";
import { graphClientContractMetadata } from "./client-contract-metadata.js";
import { createSubgraphNode, type GraphAsNodeOptions } from "./graph-subgraph.js";
import { GRAPH_EXECUTION } from "./graph-execution-symbol.js";
import type {
  DefineGraphOptions,
  GraphDescriptor,
  GraphNodeLike,
  GraphState,
  GraphStateKey,
} from "./define-graph.types.js";

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
  const stateProfile =
    options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
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
      clientContract: graphDescriptorClientMetadata(id, options.state, client, workflow),
    };
    attachGraphExecution(descriptor, options, operations);
    return Object.freeze(descriptor) as unknown as GraphDescriptor<
      Id,
      InputSchema,
      OutputSchema,
      State,
      Nodes
    >;
  };
}

/** Projects validated graph metadata using the selected public client fields.
 * @param id - Stable graph identity.
 * @param state - Native state schema.
 * @param client - Validated optional exposure policy.
 * @param workflow - Validated workflow metadata.
 * @returns The existing projected graph client contract.
 */
function graphDescriptorClientMetadata(
  id: string,
  state: import("./client-contract-metadata.types.js").GraphClientMetadataOptions["state"],
  client: import("./client-contract-metadata.types.js").GraphClientMetadataOptions["client"],
  workflow: import("./graph-workflow.types.js").GraphWorkflow,
) {
  return graphClientContractMetadata({
    id,
    state,
    ...(client === undefined ? {} : { client }),
    workflow,
  });
}

/** Attaches hidden execution state and subgraph conversion after validation.
 * @param descriptor - Validated descriptor before freezing.
 * @param options - Native state and persistence options.
 * @param operations - Validated edge operation tuple.
 * @returns Nothing; the same descriptor receives hidden fields.
 */
function attachGraphExecution<
  Descriptor extends object,
  State extends AnyStateSchema,
  Operations extends readonly object[],
>(
  descriptor: Descriptor,
  options: { readonly state: State } & Pick<
    import("./define-graph.types.js").GraphExecution,
    "checkpointer" | "store"
  >,
  operations: Operations,
): void {
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
}
