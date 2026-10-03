import type { AgentStateProvider } from "@relkit/agents";
import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";

/** Polling policy for observing updates from other agent-state processes. */
export interface LocalAgentStateProviderOptions {
  readonly pollingMs?: number;
}

/** Effect counterpart of the established public agent-state provider methods. */
export type AgentStateEffects = {
  readonly [K in keyof AgentStateProvider]: AgentStateProvider[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => Effect.Effect<Awaited<R>, LocalOperationError>
    : AgentStateProvider[K];
};
