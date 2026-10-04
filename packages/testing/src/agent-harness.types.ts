import type { Effect } from "effect";
import type { TestAgent, TestAgentInvocationOptions } from "./agents-types.js";
import type { AgentObservedEdge } from "@relkit/agents";
import type { spanSnapshot } from "@relkit/invocation";

/** Trace ledgers and native work belong to the same agent owner. */
export interface AgentOwnedState {
  closed: boolean;
  invocationSequence: number;
  readonly spans: ReturnType<typeof spanSnapshot>[];
  readonly edges: AgentObservedEdge[];
  readonly active: Set<AbortController>;
  readonly pending: Set<Promise<unknown>>;
  closing?: Promise<void>;
}

/** Native state facade and Effect-owned invocation/shutdown workflows. */
export interface AgentHarnessService {
  readonly close: Effect.Effect<void, unknown>;
  readonly value: Omit<TestAgent, "invoke">;
  readonly invoke: (
    input: unknown,
    invocation?: TestAgentInvocationOptions,
  ) => Effect.Effect<unknown, unknown>;
}
