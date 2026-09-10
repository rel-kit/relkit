import type {
  AcceptRunReceipt,
  AgentWaitingState,
  BrowserMessage,
  CompletionReceipt,
  ContinuationReceipt,
  ControlClaim,
  ControlRecord,
  ControlReceipt,
  ExecutionClaim,
  JournalRecord,
  StoredApproval,
  StoredRun,
  StoredThread,
} from "@relkit/agents";

export const LOCAL_AGENT_STATE_VERSION = 1;

export interface StoredReceipt<Value> {
  readonly semanticDigest: string;
  readonly expiresAt: string;
  readonly value: Value;
}

export interface LocalControl {
  readonly sequence: number;
  readonly record: ControlRecord;
  readonly receipt: ControlReceipt;
  readonly semanticDigest: string;
  readonly expiresAt: string;
  readonly publicPayload: unknown;
  readonly downstreamOperationId?: string;
}

export interface LocalAgentThread {
  readonly scopeKey: string;
  readonly thread: StoredThread;
  readonly activeRunId?: string;
  readonly runs: Readonly<Record<string, LocalStoredRun>>;
  readonly messages: readonly BrowserMessage[];
  readonly approvals: readonly StoredApproval[];
  readonly waiting?: AgentWaitingState;
  readonly journal: readonly JournalRecord[];
  readonly controls: Readonly<Record<string, LocalControl>>;
  readonly sequence: number;
  readonly controlSequence: number;
  readonly nextFence: number;
  readonly runClaims: Readonly<Record<string, ExecutionClaim>>;
  readonly controlClaims: Readonly<Record<string, ControlClaim>>;
  readonly snapshots?: Readonly<Record<string, LocalPinnedSnapshot>>;
}

export interface LocalPinnedSnapshot {
  readonly createdAt: string;
  readonly messages: readonly BrowserMessage[];
}

export interface LocalStoredRun extends StoredRun {
  readonly maxJournalBytes: number;
  readonly maxJournalRecordBytes: number;
  readonly terminalReserveBytes: number;
}

export interface LocalAgentState {
  readonly version: typeof LOCAL_AGENT_STATE_VERSION;
  readonly providerEpoch: string;
  readonly revision: number;
  readonly threads: Readonly<Record<string, LocalAgentThread>>;
  readonly createReceipts: Readonly<
    Record<string, { readonly digest: string; readonly threadId: string }>
  >;
  readonly runReceipts: Readonly<
    Record<string, StoredReceipt<AcceptRunReceipt | CompletionReceipt>>
  >;
  readonly controlReceipts: Readonly<Record<string, StoredReceipt<ControlReceipt>>>;
  readonly continuationReceipts: Readonly<Record<string, StoredReceipt<ContinuationReceipt>>>;
}

export function emptyAgentState(): LocalAgentState {
  return {
    version: LOCAL_AGENT_STATE_VERSION,
    providerEpoch: crypto.randomUUID(),
    revision: 0,
    threads: {},
    createReceipts: {},
    runReceipts: {},
    controlReceipts: {},
    continuationReceipts: {},
  };
}
