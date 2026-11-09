/** Inputs and results of the shared agent adapter conformance suite. */
import type { AgentAdapterRuntime, AgentRuntimeAdapterAny } from "relkit/agent-adapters";

/** One scripted model turn, written once for every adapter.*/
export interface AgentConformanceTurn {
  readonly text?: string;
  readonly toolCalls?: readonly {
    readonly id: string;
    /** Model-facing tool name, such as `conformance_lookup` or `relkit_output`. */
    readonly name: string;
    readonly input: unknown;
  }[];
}

/** What an adapter supplies to run the suite.*/
export interface AgentConformanceOptions {
  /** Creates the agent's `runtime` value, such as `langchain()`. */
  readonly adapter: () => AgentRuntimeAdapterAny;
  /** The adapter's runtime half, exported from its runtime entry. */
  readonly runtime: AgentAdapterRuntime;
  /** Builds the adapter's native scripted model from neutral turns. */
  readonly scriptedModel: (turns: readonly AgentConformanceTurn[]) => unknown;
}

/** One conformance case.*/
export interface AgentConformanceCase {
  readonly id:
    "tools" | "approvals" | "threads" | "streaming" | "access-rules" | "traces" | "model-profiles";
  readonly description: string;
}

/**
 * Cases plus a runner that rejects when the adapter breaks a case. It is a `ConformanceHarness`,
 * so `runConformance` from `@relkit/testing/conformance` reports it per case.
 */
export interface AgentConformanceHarness {
  readonly suite: "agents";
  readonly cases: readonly AgentConformanceCase[];
  readonly run: (caseId: AgentConformanceCase["id"]) => Promise<void>;
}
