import type {
  AcceptControlRequest,
  AdmitContinuationRequest,
  ClaimControlRequest,
  ControlPage,
  LookupContinuationReceiptRequest,
  LookupControlReceiptRequest,
  MarkControlEffectStartedRequest,
  ReadControlsRequest,
  RecoverAbandonedControlRequest,
  RenewControlClaimRequest,
  SettleControlRequest,
  WaitForControlsRequest,
} from "./state-control-requests.js";
import type {
  AcceptRunRequest,
  AppendJournalRequest,
  ClaimRunRequest,
  CompleteRunRequest,
  CreateThreadRequest,
  InterruptOwnedRunRequest,
  JournalPage,
  ListThreadsRequest,
  LoadThreadRequest,
  LookupRunReceiptRequest,
  ReadJournalRequest,
  ReadSnapshotHistoryRequest,
  RenewRunClaimRequest,
  SnapshotHistoryPage,
  SuspendRunRequest,
  ThreadList,
  WaitForJournalRequest,
} from "./state-thread-requests.js";
import type {
  AcceptRunReceipt,
  CompletionReceipt,
  ContinuationReceipt,
  ContinuationReceiptLookup,
  ControlReceipt,
  ControlReceiptLookup,
  CreateThreadReceipt,
  InterruptionReceipt,
  JournalReceipt,
  RunReceiptLookup,
  SuspensionReceipt,
} from "./state-receipts.js";
import type { ControlClaim, ExecutionClaim, ThreadSnapshot } from "./state-types.js";

export interface AgentStateProvider {
  getEpoch(): Promise<string>;
  createThread(request: CreateThreadRequest): Promise<CreateThreadReceipt>;
  listThreads(request: ListThreadsRequest): Promise<ThreadList>;
  loadThread(request: LoadThreadRequest): Promise<ThreadSnapshot>;
  readSnapshotHistory(request: ReadSnapshotHistoryRequest): Promise<SnapshotHistoryPage>;
  acceptRun(request: AcceptRunRequest): Promise<AcceptRunReceipt>;
  lookupRunReceipt(request: LookupRunReceiptRequest): Promise<RunReceiptLookup>;
  readJournal(request: ReadJournalRequest): Promise<JournalPage>;
  waitForJournal(request: WaitForJournalRequest): Promise<void>;
  claimRun(request: ClaimRunRequest): Promise<ExecutionClaim>;
  renewRunClaim(request: RenewRunClaimRequest): Promise<ExecutionClaim>;
  appendJournal(request: AppendJournalRequest): Promise<JournalReceipt>;
  completeRun(request: CompleteRunRequest): Promise<CompletionReceipt>;
  suspendRun(request: SuspendRunRequest): Promise<SuspensionReceipt>;
  interruptOwnedRun(request: InterruptOwnedRunRequest): Promise<InterruptionReceipt>;
  acceptControl(request: AcceptControlRequest): Promise<ControlReceipt>;
  lookupControlReceipt(request: LookupControlReceiptRequest): Promise<ControlReceiptLookup>;
  readControls(request: ReadControlsRequest): Promise<ControlPage>;
  waitForControls(request: WaitForControlsRequest): Promise<void>;
  claimControl(request: ClaimControlRequest): Promise<ControlClaim>;
  renewControlClaim(request: RenewControlClaimRequest): Promise<ControlClaim>;
  markControlEffectStarted(request: MarkControlEffectStartedRequest): Promise<ControlReceipt>;
  settleControl(request: SettleControlRequest): Promise<ControlReceipt>;
  recoverAbandonedControl(request: RecoverAbandonedControlRequest): Promise<ControlReceipt>;
  admitContinuation(request: AdmitContinuationRequest): Promise<ContinuationReceipt>;
  lookupContinuationReceipt(
    request: LookupContinuationReceiptRequest,
  ): Promise<ContinuationReceiptLookup>;
}
