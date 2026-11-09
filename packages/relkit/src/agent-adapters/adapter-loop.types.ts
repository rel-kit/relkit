/** Inputs of the shared agent loop that adapters build on; only the model turn is SDK-specific. */
import type {
  AgentAdapterContext,
  AgentModelTurn,
  AgentModelTurnRequest,
  AgentThreadMessage,
  ResolvedAgentModel,
} from "./adapter.types.js";

/** Options for `createAgentAdapterRuntime`. @experimental */
export interface AgentLoopOptions<AdapterId extends string> {
  readonly adapterId: AdapterId;
  /**
   * Runs one model turn with the adapter's SDK.
   * @param request - Resolved model, thread messages, bridged tool definitions and cancellation.
   * @returns Text and tool calls the model produced.
   */
  readonly turn: (request: AgentModelTurnRequest) => Promise<AgentModelTurn>;
}

/** Error raised by a run that cannot finish. @experimental */
export interface AgentAdapterFailure {
  readonly code: string;
  readonly message: string;
}

/** Mutable state of one run inside the shared loop. */
export interface AgentLoopState {
  readonly context: AgentAdapterContext;
  readonly threadId: string;
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly model: ResolvedAgentModel;
  messages: AgentThreadMessage[];
  steps: number;
  toolCalls: number;
}
