import { Context, Effect, Layer } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentDescriptor } from "./define-agent.js";
import { hasDeepAgentCapabilities } from "./define-agent-deep.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { NativeTools } from "./runtime-native-tools.js";
import type { DeepAgentsLoaderService } from "./runtime-native-support.types.js";

export type { DeepAgentsLoaderService } from "./runtime-native-support.types.js";

/** Substitutable loader for the optional DeepAgents dependency.
 * @example Effect.provide(loadDeepAgentsEffect(), DeepAgentsLoaderLive);
 */
export class DeepAgentsLoader extends Context.Service<DeepAgentsLoader, DeepAgentsLoaderService>()(
  "relkit/agents/DeepAgentsLoader",
) {}

/** Live dynamic import of the optional DeepAgents dependency.
 * @example Effect.runPromise(Effect.provide(loadDeepAgentsEffect(), DeepAgentsLoaderLive));
 */
export const DeepAgentsLoaderLive = Layer.succeed(
  DeepAgentsLoader,
  DeepAgentsLoader.of({
    load: () => import("deepagents"),
  }),
);

/** Combines public IDs and failures from native tool groups.
 * @param groups - Root and subagent tool groups.
 * @returns An Effect with combined tools or AgentInvocationFailure.
 * @example Effect.runSync(combineNativeToolsEffect(groups));
 */
export const combineNativeToolsEffect = Effect.fn("Agents.runtime.combineNativeTools")(
  (groups: readonly NativeTools[]) =>
    Effect.try({
      try: (): NativeTools => {
        const publicIds = new Map<string, string>();
        const relkitNames = new Set<string>();
        for (const group of groups) {
          for (const [name, id] of group.publicIds) publicIds.set(name, id);
          for (const name of group.relkitNames) relkitNames.add(name);
        }
        return {
          values: groups[0]!.values,
          publicIds,
          relkitNames,
          failure: () =>
            groups.map((group) => group.failure()).find((failure) => failure !== undefined),
        };
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.combine-native-tools", effect),
);

/** Combines tool groups for existing synchronous callers.
 * @param groups - Root and subagent tool groups.
 * @returns Combined tool names and failure reader.
 * @throws The original invalid group error.
 * @example combineNativeTools(groups);
 */
export function combineNativeTools(groups: readonly NativeTools[]): NativeTools {
  return Effect.runSync(
    combineNativeToolsEffect(groups).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Projects authored instructions to native system prompt text.
 * @param agent - Authored agent descriptor.
 * @returns An Effect with prompt text or AgentInvocationFailure.
 * @example Effect.runSync(nativeInstructionsEffect(agent));
 */
export const nativeInstructionsEffect = Effect.fn("Agents.runtime.nativeInstructions")(
  (agent: AgentDescriptor<string, unknown, unknown>) =>
    Effect.try({
      try: () => {
        const value = agent.instructions;
        if (typeof value === "string") return value;
        if ("template" in value) return value.template;
        return typeof value.value === "string" ? value.value : value.value.join("\n\n");
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.native-instructions", effect),
);

/** Projects native instructions for existing synchronous callers.
 * @param agent - Authored agent descriptor.
 * @returns Native system prompt text.
 * @throws The original invalid instructions error.
 * @example nativeInstructions(agent);
 */
export function nativeInstructions(agent: AgentDescriptor<string, unknown, unknown>): string {
  return Effect.runSync(
    nativeInstructionsEffect(agent).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Loads the optional DeepAgents module through a replaceable service.
 * @returns An Effect with DeepAgents or AgentInvocationFailure.
 * @example await Effect.runPromise(Effect.provide(loadDeepAgentsEffect(), DeepAgentsLoaderLive));
 */
export const loadDeepAgentsEffect = Effect.fn("Agents.runtime.loadDeepAgents")(
  function* () {
    const loader = yield* DeepAgentsLoader;
    return yield* Effect.tryPromise({
      try: () => loader.load(),
      catch: () =>
        agentInvocationFailure(
          new AgentRuntimeError(
            "RELKIT_DEEPAGENTS_UNAVAILABLE",
            "DeepAgents capabilities require the application dependency deepagents@1.13.3",
          ),
        ),
    });
  },
  (effect) => observeAgent("runtime.load-deepagents", effect),
);

/** Loads DeepAgents for existing Promise callers.
 * @returns The optional DeepAgents module.
 * @throws AgentRuntimeError when the module is unavailable.
 * @example await loadDeepAgents();
 */
export function loadDeepAgents(): Promise<typeof import("deepagents")> {
  return Effect.runPromise(
    loadDeepAgentsEffect().pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
      Effect.provide(DeepAgentsLoaderLive),
    ),
  );
}

/** Verifies optional runtime dependencies for authored agents.
 * @param agents - Root and subagent descriptors.
 * @returns An Effect with void or AgentInvocationFailure.
 * @example await Effect.runPromise(Effect.provide(assertAgentRuntimeDependenciesEffect(agents), DeepAgentsLoaderLive));
 */
export const assertAgentRuntimeDependenciesEffect = Effect.fn("Agents.runtime.assertDependencies")(
  function* (agents: readonly AgentDescriptor<string, unknown, unknown>[]) {
    if (agents.some(hasDeepAgentCapabilities)) yield* loadDeepAgentsEffect();
  },
  (effect) => observeAgent("runtime.assert-dependencies", effect),
);

/** Verifies optional runtime dependencies for existing Promise callers.
 * @param agents - Root and subagent descriptors.
 * @returns A Promise that resolves when dependencies are available.
 * @throws AgentRuntimeError for an unavailable dependency.
 * @example await assertAgentRuntimeDependencies(agents);
 */
export function assertAgentRuntimeDependencies(
  agents: readonly AgentDescriptor<string, unknown, unknown>[],
): Promise<void> {
  return Effect.runPromise(
    assertAgentRuntimeDependenciesEffect(agents).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
      Effect.provide(DeepAgentsLoaderLive),
    ),
  );
}
