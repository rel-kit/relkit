/** Inputs the generated server passes to an agent adapter's `invokeAgentFunction`. */
import type { ApprovalRecord, PendingApproval } from "relkit/agents";
import type { ToolEngine, ToolSource } from "relkit/tools";

/** Agent invocation options shared with the LangChain adapter's runtime entry. @experimental */
export interface AiSdkInvocationOptions {
  readonly agent: {
    readonly id: string;
    readonly model?: unknown;
    readonly instructions: unknown;
    readonly output: import("relkit/schema").StandardSchemaV1;
    readonly tools: readonly { readonly ref: { readonly id: string } }[];
    readonly limits: {
      readonly maxSteps: number;
      readonly maxToolCalls: number;
      readonly timeoutMs: number;
    };
    readonly runtime: import("relkit/agent-adapters").AgentRuntimeReference;
  };
  readonly input: unknown;
  readonly tools: ToolSource;
  readonly engine: ToolEngine;
  readonly modelRegistry?: {
    readonly resolveModel: (selector?: string) => unknown;
  };
  readonly invocationId?: string;
  readonly threadId?: string;
  readonly signal?: AbortSignal;
  readonly approval?: (
    approval: PendingApproval,
  ) =>
    | "approved"
    | "denied"
    | boolean
    | ApprovalRecord
    | Promise<"approved" | "denied" | boolean | ApprovalRecord>;
}
