import type { GraphDescriptor, GraphNodeLike } from "./define-graph.js";
import { isGraphNodeDescriptor } from "./define-graph-node.js";
import { isSubgraphNode, subgraphForNode } from "./graph-subgraph.js";
import type { AgentWaitingRequest } from "./state.types.js";
import { validateValue } from "./runtime-utils.js";
import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphContinuationFailure } from "./graph-continuation-error.js";

/** Validates one or more graph continuation replies with bounded concurrency.
 * @param descriptor - Graph whose nodes own the continuation schemas.
 * @param requests - Waiting requests in graph order.
 * @param value - One reply or a list matching the requests.
 * @returns An Effect with validated reply values or GraphContinuationFailure.
 * @example Effect.runPromise(validateGraphResumeInputEffect(graph, requests, reply));
 */
export const validateGraphResumeInputEffect = Effect.fn("Agents.graph.validateResume")(
  function* (
    descriptor: GraphDescriptor,
    requests: readonly AgentWaitingRequest[],
    value: unknown,
  ) {
    yield* Effect.try({
      try: () => {
        if (requests.length === 0) throw new TypeError("Graph has no waiting continuation");
        if (requests.length > 1 && (!Array.isArray(value) || value.length !== requests.length)) {
          throw new TypeError(`Graph continuation requires ${requests.length} replies`);
        }
      },
      catch: graphContinuationFailure,
    });
    if (requests.length === 1) {
      return yield* Effect.tryPromise({
        try: () => validateRequest(descriptor, requests[0]!, value),
        catch: graphContinuationFailure,
      });
    }
    const values = value as readonly unknown[];
    const outcomes = yield* Effect.forEach(
      requests,
      (request, index) =>
        Effect.result(
          Effect.tryPromise({
            try: () => validateRequest(descriptor, request, values[index]),
            catch: graphContinuationFailure,
          }),
        ),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    return outcomes.map((outcome) => (Result.isSuccess(outcome) ? outcome.success : undefined));
  },
  (effect) => observeAgent("graph.validate-resume", effect),
);

/** Validates graph continuation replies for existing Promise callers.
 * @param descriptor - Graph whose nodes own the continuation schemas.
 * @param requests - Waiting requests in graph order.
 * @param value - One reply or a list matching the requests.
 * @returns Validated reply values.
 * @throws The original continuation validation error.
 * @example await validateGraphResumeInput(graph, requests, reply);
 */
export function validateGraphResumeInput(
  descriptor: GraphDescriptor,
  requests: readonly AgentWaitingRequest[],
  value: unknown,
): Promise<unknown> {
  return Effect.runPromise(
    validateGraphResumeInputEffect(descriptor, requests, value).pipe(
      Effect.catchTag("GraphContinuationFailure", (failure) => Effect.fail(failure.cause)),
    ),
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
