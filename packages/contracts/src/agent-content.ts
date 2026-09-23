/** Browser-safe message snapshot shown for one agent run. */
export interface BrowserMessage {
  readonly messageId: string;
  readonly runId?: string;
  readonly role: "user" | "assistant" | "tool";
  readonly parts: readonly BrowserMessagePart[];
  readonly createdAt: string;
}

/** Text, tool, or progress content carried by a browser message. */
export type BrowserMessagePart =
  | {
      readonly partId: string;
      readonly kind: "text";
      readonly text: string;
      readonly state?: "streaming" | "complete";
    }
  | {
      readonly partId: string;
      readonly kind: "tool";
      readonly toolCallId: string;
      readonly toolId: string;
      readonly state: ToolPartState;
      readonly inputText?: string;
      readonly input?: unknown;
      readonly output?: unknown;
      readonly value?: unknown;
    }
  | ({
      readonly partId: string;
      readonly kind: "progress";
      readonly value: unknown;
    } & AgentProgressScope);

/** Identifies whether progress belongs to a run or a particular tool call. */
export type AgentProgressScope =
  | { readonly scope: "run"; readonly toolCallId?: never; readonly toolId?: never }
  | { readonly scope: "tool"; readonly toolCallId: string; readonly toolId: string };

/** Lifecycle state of a tool part in a streamed browser message. */
export type ToolPartState =
  | "started"
  | "input-streaming"
  | "input-ready"
  | "approval-required"
  | "running"
  | "succeeded"
  | "failed"
  | "denied";
