export type {
  AgentClientEvent,
  AgentExecutionEvent,
  AgentExecutionSnapshot,
  AgentObservation,
  AgentWaitingState,
  BrowserMessage,
  BrowserMessagePart,
  ClientIdentityDocument,
  JournalCheckpoint,
  StoredRun,
  ThreadListItem,
  ThreadSnapshot,
  ToolPartState,
} from "@relkit/contracts";

import type { ThreadListItem } from "@relkit/contracts";

export interface ThreadList {
  readonly threads: readonly ThreadListItem[];
}
