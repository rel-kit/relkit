import { Command } from "@langchain/langgraph";
import { getJsonSchema } from "@relkit/schema";
import { graphExecution, type GraphDescriptor, type GraphNodeLike } from "./define-graph.js";
import { isGraphNodeDescriptor } from "./define-graph-node.js";
import { isSubgraphNode, subgraphForNode } from "./graph-subgraph.js";
import type { compileGraph } from "./graph-compile.js";
import type { GraphWaitingInterrupt } from "./graph-interruption.js";
import type { AgentWaitingRequest } from "./state-types.js";
import { validateValue } from "./runtime-utils.js";

export type GraphConfig = {} | { readonly configurable: { readonly thread_id: string } };
type CompiledGraph = ReturnType<typeof compileGraph>;

export function graphConfig(descriptor: GraphDescriptor, threadId?: string): GraphConfig {
  const persistent = graphExecution(descriptor).checkpointer !== undefined;
  if (persistent && (typeof threadId !== "string" || threadId.length === 0)) {
    throw new TypeError("Graph execution with a checkpointer requires threadId");
  }
  return threadId === undefined ? {} : { configurable: { thread_id: threadId } };
}

export async function resumeCommand(
  graph: CompiledGraph,
  descriptor: GraphDescriptor,
  config: GraphConfig,
  value: unknown,
): Promise<Command> {
  if (graphExecution(descriptor).checkpointer === undefined) {
    throw new TypeError("Graph resume requires a checkpointer");
  }
  const requests = await waitingInterrupts(graph, descriptor, config);
  const reply = await validateGraphResumeInput(descriptor, requests, value);
  return new Command({ resume: nativeResume(requests, reply) });
}

export async function validateGraphResumeInput(
  descriptor: GraphDescriptor,
  requests: readonly AgentWaitingRequest[],
  value: unknown,
): Promise<unknown> {
  if (requests.length === 0) throw new TypeError("Graph has no waiting continuation");
  if (requests.length === 1) return validateRequest(descriptor, requests[0]!, value);
  if (!Array.isArray(value) || value.length !== requests.length) {
    throw new TypeError(`Graph continuation requires ${requests.length} replies`);
  }
  return Promise.all(
    requests.map((request, index) => validateRequest(descriptor, request, value[index])),
  );
}

async function validateRequest(
  descriptor: GraphDescriptor,
  request: AgentWaitingRequest,
  value: unknown,
): Promise<unknown> {
  const node = resumeNode(descriptor, request.node.split("/"));
  if (!isGraphNodeDescriptor(node) || node.resume === undefined) {
    throw new TypeError(`Graph node "${request.node}" has no continuation schema`);
  }
  return validateValue(node.resume, value, "input");
}

function resumeNode(
  descriptor: GraphDescriptor,
  path: readonly string[],
): GraphNodeLike | undefined {
  const [head, ...tail] = path;
  const node = descriptor.nodes.find((candidate) => candidate.id === head);
  if (tail.length === 0) return node;
  return isSubgraphNode(node) ? resumeNode(subgraphForNode(node), tail) : undefined;
}

function nativeResume(requests: readonly GraphWaitingInterrupt[], value: unknown): unknown {
  const values = requests.length === 1 ? [value] : (value as readonly unknown[]);
  const entries = requests.map((request, index) => {
    if (request.id === undefined) throw new TypeError("Graph interruption has no native ID");
    return [request.id, values[index]] as const;
  });
  return Object.fromEntries(entries);
}

export async function waitingInterrupts(
  graph: CompiledGraph,
  descriptor: GraphDescriptor,
  config: GraphConfig,
): Promise<readonly GraphWaitingInterrupt[]> {
  const snapshot = await graph.getState(config, { subgraphs: true });
  return snapshotInterrupts(snapshot, descriptor, []);
}

function snapshotInterrupts(
  snapshot: any,
  descriptor: GraphDescriptor,
  path: readonly string[],
): readonly GraphWaitingInterrupt[] {
  return snapshot.tasks.flatMap((task: any) => {
    const node = descriptor.nodes.find((candidate) => candidate.id === task.name);
    if (isSubgraphNode(node) && task.state?.tasks !== undefined) {
      return snapshotInterrupts(task.state, subgraphForNode(node), [...path, node.id]);
    }
    if (!isGraphNodeDescriptor(node) || node.resume === undefined) return [];
    const projection = getJsonSchema(node.resume);
    return task.interrupts.map((entry: { readonly id?: string; readonly value?: unknown }) => ({
      ...(entry.id === undefined ? {} : { id: entry.id }),
      node: [...path, task.name].join("/"),
      ...(entry.value === undefined ? {} : { value: entry.value }),
      response: projection.ok ? projection.schema : null,
    }));
  });
}
