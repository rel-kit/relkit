import type { AgentObservation, JournalCheckpoint, JournalRecord } from "@relkit/agents";

/** Contract for agent protocol frame used by agent protocol stream. */
export type AgentProtocolFrame =
  | { readonly kind: "state"; readonly value: unknown }
  | { readonly kind: "text-start"; readonly messageId: string }
  | { readonly kind: "text-delta"; readonly messageId: string; readonly delta: string }
  | { readonly kind: "text-end"; readonly messageId: string }
  | ({
      readonly kind: "progress";
      readonly partId: string;
      readonly value: unknown;
    } & import("@relkit/agents").AgentProgressScope)
  | { readonly kind: "approval"; readonly approvalId: string; readonly value: unknown }
  | {
      readonly kind: "event";
      readonly event: JournalRecord["kind"] | "execution" | "execution-snapshot" | "observation";
      readonly value: unknown;
      readonly eventId?: string;
      readonly recordId?: string;
      readonly runId?: string;
      readonly createdAt?: string;
    }
  | {
      readonly kind: "tool";
      readonly toolCallId: string;
      readonly toolId: string;
      readonly state: import("@relkit/agents").ToolPartState;
      readonly value?: unknown;
      readonly inputStarted?: boolean;
      readonly inputDelta?: string;
    }
  | {
      readonly kind: "terminal";
      readonly threadId: string;
      readonly runId: string;
      readonly status: string;
      readonly text?: string;
    };

/** Contract for agent protocol emission used by agent protocol stream. */
export interface AgentProtocolEmission {
  readonly frame: AgentProtocolFrame;
  readonly checkpoint?: JournalCheckpoint;
  readonly observation?: AgentObservation;
}
