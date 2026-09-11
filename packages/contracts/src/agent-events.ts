import type { AgentProgressScope, BrowserMessage } from "./agent-content.js";
import type { AgentExecutionEvent } from "./agent-execution.js";
import type { JournalCheckpoint, ThreadSnapshot } from "./agent-state.js";

interface AgentClientEventBase {
  readonly eventId: string;
  readonly recordId: string;
  readonly runId: string;
  readonly checkpoint: JournalCheckpoint;
  readonly createdAt: string;
}

export type AgentToolEvent = AgentClientEventBase & {
  readonly messageId: string;
  readonly partId: string;
  readonly toolCallId: string;
  readonly toolId: string;
} & (
    | { readonly kind: "tool-started" }
    | { readonly kind: "tool-input"; readonly input: string }
    | { readonly kind: "tool-input-ready"; readonly input: unknown }
    | { readonly kind: "tool-approval-required" }
    | { readonly kind: "tool-executing" }
    | { readonly kind: "tool-succeeded"; readonly output: unknown }
    | { readonly kind: "tool-failed" }
    | { readonly kind: "tool-denied" }
  );

export type AgentProgressEvent = AgentClientEventBase & {
  readonly kind: "progress";
  readonly progressId: string;
  readonly messageId?: string;
  readonly value: unknown;
} & AgentProgressScope;

export type AgentClientEvent =
  | (AgentClientEventBase & { readonly kind: "message-updated"; readonly message: BrowserMessage })
  | AgentProgressEvent
  | AgentToolEvent
  | (AgentClientEventBase & {
      readonly kind: "execution-event";
      readonly value: AgentExecutionEvent;
    })
  | (AgentClientEventBase & {
      readonly kind: "approval" | "control" | "run-finished" | "run-interrupted";
      readonly value: unknown;
    });

export type AgentObservation =
  | { readonly kind: "event"; readonly event: AgentClientEvent }
  | { readonly kind: "snapshot"; readonly snapshot: ThreadSnapshot }
  | {
      readonly kind: "gap";
      readonly reason: "expired" | "foreign" | "future" | "session" | "provider-reset";
      readonly snapshot: ThreadSnapshot;
    };
