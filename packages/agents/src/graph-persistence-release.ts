import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphExecution, isGraphDescriptor } from "./define-graph.js";
import { isPersistenceResource } from "./define-persistence.js";
import type { AgentPersistenceDeclaration } from "./graph-persistence.types.js";
import { agentPersistenceFailure } from "./persistence-error.js";

/** Releases declared persistence resources with bounded concurrency.
 * @param descriptors - Agent and graph descriptors owning resources.
 * @returns An Effect with void or AgentPersistenceFailure.
 * @example Effect.runPromise(releaseAgentPersistenceEffect([agent]));
 */
export const releaseAgentPersistenceEffect = Effect.fn("Agents.persistence.release")(
  function* (descriptors: readonly unknown[]) {
    const resources = descriptors.flatMap((descriptor) => {
      const persistence = isGraphDescriptor(descriptor)
        ? graphExecution(descriptor)
        : agentPersistence(descriptor);
      return persistence === undefined
        ? []
        : [persistence.checkpointer, persistence.store].filter(isPersistenceResource);
    });
    const outcomes = yield* Effect.forEach(
      resources,
      (resource) =>
        Effect.result(
          Effect.tryPromise({ try: () => resource.release(), catch: agentPersistenceFailure }),
        ),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
  },
  (effect) => observeAgent("persistence.release", effect),
);

/** Releases persistence resources for existing Promise callers.
 * @param descriptors - Agent and graph descriptors owning resources.
 * @returns A Promise that resolves after every release has been attempted.
 * @throws The first release error in descriptor order.
 * @example await releaseAgentPersistence([agent]);
 */
export function releaseAgentPersistence(descriptors: readonly unknown[]): Promise<void> {
  return Effect.runPromise(
    releaseAgentPersistenceEffect(descriptors).pipe(
      Effect.catchTag("AgentPersistenceFailure", (error) => Effect.fail(error.cause)),
    ),
  );
}

function agentPersistence(value: unknown): AgentPersistenceDeclaration | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { kind?: unknown }).kind !== "agent"
  ) {
    return undefined;
  }
  return value as AgentPersistenceDeclaration;
}
