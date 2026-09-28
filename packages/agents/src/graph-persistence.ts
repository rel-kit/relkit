import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphExecution, type GraphDescriptor } from "./define-graph.js";
import { assertPersistenceProtocol, isPersistenceResource } from "./define-persistence.js";
import type {
  AgentPersistenceDeclaration,
  AnyPersistenceResource,
  ResolvedGraphPersistence,
  ResolutionState,
} from "./graph-persistence.types.js";
import { agentPersistenceFailure } from "./persistence-error.js";

export type {
  AgentPersistenceDeclaration,
  ResolvedGraphPersistence,
} from "./graph-persistence.types.js";
export {
  releaseAgentPersistence,
  releaseAgentPersistenceEffect,
} from "./graph-persistence-release.js";

const resolutions = new WeakMap<AnyPersistenceResource, ResolutionState>();

/** Resolves a graph's declared persistence handles.
 * @param descriptor - Graph being invoked.
 * @param env - Environment passed to resource factories.
 * @param signal - Optional invocation cancellation signal.
 * @returns An Effect with resolved handles or AgentPersistenceFailure.
 * @example Effect.runPromise(resolveGraphPersistenceEffect(graph, {}));
 */
export const resolveGraphPersistenceEffect = Effect.fn("Agents.persistence.resolveGraph")(
  (descriptor: GraphDescriptor, env: Readonly<Record<string, unknown>>) =>
    Effect.tryPromise({
      try: (signal) => {
        const execution = graphExecution(descriptor);
        return resolvePair(execution.checkpointer, execution.store, env, false, signal);
      },
      catch: agentPersistenceFailure,
    }),
  (effect) => observeAgent("persistence.resolve-graph", effect),
);

/** Resolves graph persistence for existing Promise callers.
 * @param descriptor - Graph being invoked.
 * @param env - Environment passed to resource factories.
 * @returns Resolved graph handles.
 * @throws The original factory or protocol error.
 * @example await resolveGraphPersistence(graph, {});
 */
export function resolveGraphPersistence(
  descriptor: GraphDescriptor,
  env: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<ResolvedGraphPersistence> {
  return Effect.runPromise(
    resolveGraphPersistenceEffect(descriptor, env).pipe(
      Effect.catchTag("AgentPersistenceFailure", (error) => Effect.fail(error.cause)),
    ),
    signal === undefined ? undefined : { signal },
  );
}

/** Resolves an agent's declared persistence handles.
 * @param descriptor - Agent persistence declaration.
 * @param env - Environment passed to resource factories.
 * @param signal - Optional invocation cancellation signal.
 * @returns An Effect with resolved handles or AgentPersistenceFailure.
 * @example Effect.runPromise(resolveAgentPersistenceEffect(agent, {}));
 */
export const resolveAgentPersistenceEffect = Effect.fn("Agents.persistence.resolveAgent")(
  (descriptor: AgentPersistenceDeclaration, env: Readonly<Record<string, unknown>>) =>
    Effect.tryPromise({
      try: (signal) => resolvePair(descriptor.checkpointer, descriptor.store, env, true, signal),
      catch: agentPersistenceFailure,
    }),
  (effect) => observeAgent("persistence.resolve-agent", effect),
);

/** Resolves agent persistence for existing Promise callers.
 * @param descriptor - Agent persistence declaration.
 * @param env - Environment passed to resource factories.
 * @returns Resolved agent handles.
 * @throws The original factory or protocol error.
 * @example await resolveAgentPersistence(agent, {});
 */
export function resolveAgentPersistence(
  descriptor: AgentPersistenceDeclaration,
  env: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<ResolvedGraphPersistence> {
  return Effect.runPromise(
    resolveAgentPersistenceEffect(descriptor, env).pipe(
      Effect.catchTag("AgentPersistenceFailure", (error) => Effect.fail(error.cause)),
    ),
    signal === undefined ? undefined : { signal },
  );
}

async function resolvePair(
  declaredCheckpointer: unknown,
  declaredStore: unknown,
  env: Readonly<Record<string, unknown>>,
  validateRaw: boolean,
  signal: AbortSignal,
): Promise<ResolvedGraphPersistence> {
  const participating = new Set<AnyPersistenceResource>();
  const acquired = new Set<AnyPersistenceResource>();
  try {
    const checkpointer = await resolve(declaredCheckpointer, env, participating, acquired);
    signal.throwIfAborted();
    const store = await resolve(declaredStore, env, participating, acquired);
    signal.throwIfAborted();
    if (validateRaw && checkpointer !== undefined) {
      assertPersistenceProtocol("checkpointer", checkpointer);
    }
    if (validateRaw && store !== undefined) assertPersistenceProtocol("memory", store);
    signal.throwIfAborted();
    for (const resource of participating) finishResolution(resource, true);
    return {
      ...(checkpointer === undefined ? {} : { checkpointer: checkpointer as BaseCheckpointSaver }),
      ...(store === undefined ? {} : { store: store as BaseStore }),
    };
  } catch (error) {
    await Promise.allSettled(
      [...participating].map(async (resource) => {
        const state = finishResolution(resource, false);
        if (
          acquired.has(resource) &&
          resource.ownership === "owned" &&
          state.pending === 0 &&
          !state.committed
        ) {
          await resource.release();
        }
      }),
    );
    throw error;
  }
}

async function resolve(
  value: unknown,
  env: Readonly<Record<string, unknown>>,
  participating: Set<AnyPersistenceResource>,
  acquired: Set<AnyPersistenceResource>,
): Promise<unknown> {
  if (!isPersistenceResource(value)) return value;
  if (!participating.has(value)) {
    participating.add(value);
    const state = resolutions.get(value) ?? { pending: 0, committed: false };
    state.pending += 1;
    resolutions.set(value, state);
  }
  const resolved = await value.acquire({ env });
  acquired.add(value);
  assertPersistenceProtocol(value.resource, resolved);
  return resolved;
}

function finishResolution(resource: AnyPersistenceResource, committed: boolean): ResolutionState {
  const state = resolutions.get(resource);
  if (state === undefined) throw new Error("Persistence resolution state is unavailable");
  state.pending -= 1;
  if (committed) state.committed = true;
  return state;
}
