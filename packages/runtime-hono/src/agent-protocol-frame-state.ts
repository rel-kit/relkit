import type { AgentClientEvent, BrowserMessage, ThreadSnapshot } from "@relkit/agents";
import { progressFrame } from "./agent-protocol-progress.js";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";
import { toolEventFrame, toolFrame } from "./agent-protocol-tool.js";

/** Recover message, tool and approval frames for selected runs.
 * @param snapshot - Current thread snapshot.
 * @param runIds - Selected run IDs; continuation handling may extend this set.
 * @param sentText - Previously emitted text indexed by message ID.
 * @param sentParts - Previously emitted part digests indexed by part ID.
 * @param toolInputs - Accumulated tool input text indexed by call ID.
 * @param recoverState - Whether to include snapshot state and execution recovery frames.
 * @returns Deduplicated frames while updating the supplied replay maps.
 */
export function* snapshotFrames(
  snapshot: ThreadSnapshot,
  runIds: ReadonlySet<string>,
  sentText: Map<string, string>,
  sentParts: Map<string, string>,
  toolInputs: Map<string, string>,
  recoverState = false,
): Iterable<AgentProtocolFrame> {
  const acceptedAt = snapshot.currentRuns
    .filter((candidate) => runIds.has(candidate.runId))
    .map((candidate) => candidate.acceptedAt)
    .sort()[0];
  if (acceptedAt === undefined) return;
  if (recoverState) {
    if (snapshot.values !== undefined) yield { kind: "state", value: snapshot.values };
    for (const execution of snapshot.executions) {
      yield { kind: "event", event: "execution-snapshot", value: execution };
    }
  }
  for (const message of snapshot.currentMessages) {
    if (message.createdAt < acceptedAt) continue;
    yield* browserMessageFrames(message, sentText, sentParts, toolInputs);
  }
  for (const approval of snapshot.approvals) {
    if (!runIds.has(approval.runId) || sentParts.has(approval.approvalId)) continue;
    sentParts.set(approval.approvalId, approval.status);
    yield { kind: "approval", approvalId: approval.approvalId, value: approval };
  }
}

/** Translate an accepted run event while retaining replay deduplication state.
 * @param event - Native event to translate.
 * @param runIds - Selected run IDs; continuation handling may extend this set.
 * @param sentText - Previously emitted text indexed by message ID.
 * @param sentParts - Previously emitted part digests indexed by part ID.
 * @param toolInputs - Accumulated tool input text indexed by call ID.
 * @returns Protocol frames for the event, or none for unselected runs.
 */
export function* eventFrames(
  event: AgentClientEvent,
  runIds: ReadonlySet<string>,
  sentText: Map<string, string>,
  sentParts: Map<string, string>,
  toolInputs: Map<string, string>,
): Iterable<AgentProtocolFrame> {
  if (!runIds.has(event.runId)) return;
  if (event.kind === "message-updated")
    yield* browserMessageFrames(event.message, sentText, sentParts, toolInputs);
  else if (event.kind === "approval")
    yield { kind: "approval", approvalId: event.eventId, value: event.value };
  else if (event.kind === "progress") yield progressFrame(event.progressId, event.value, event);
  else if (event.kind === "control") yield { kind: "event", event: "control", value: event.value };
  else if (event.kind === "run-interrupted")
    yield { kind: "event", event: "interruption", value: event.value };
  else if (event.kind === "execution-event")
    yield {
      kind: "event",
      event: "execution",
      value: event.value,
      eventId: event.eventId,
      recordId: event.recordId,
      runId: event.runId,
      createdAt: event.createdAt,
    };
  else if ("toolCallId" in event) yield toolEventFrame(event, toolInputs);
}
/** Close emitted text messages and report the selected run's terminal status.
 * @param snapshot - Current thread snapshot.
 * @param runId - Selected run identifier.
 * @param sentText - Previously emitted text indexed by message ID.
 * @returns Text-end frames followed by one terminal frame.
 */
export function* terminalFrames(
  snapshot: ThreadSnapshot,
  runId: string,
  sentText: ReadonlyMap<string, string>,
): Iterable<AgentProtocolFrame> {
  const run = snapshot.currentRuns.find((candidate) => candidate.runId === runId)!;
  for (const messageId of sentText.keys()) yield { kind: "text-end", messageId };
  const text = latestText(snapshot, run.acceptedAt);
  yield {
    kind: "terminal",
    threadId: snapshot.thread.threadId,
    runId,
    status: run.status,
    ...(text === undefined ? {} : { text }),
  };
}

/** Check whether a selected run has reached a terminal status.
 * @param snapshot - Current thread snapshot.
 * @param runId - Selected run identifier.
 * @returns False for unknown or still-active runs.
 */
export function terminalRun(snapshot: ThreadSnapshot, runId: string): boolean {
  const run = snapshot.currentRuns.find((candidate) => candidate.runId === runId);
  return (
    run !== undefined &&
    ["succeeded", "failed", "cancelled", "worker-interrupted"].includes(run.status)
  );
}

/** Follow an approval-interrupted run to its newly active continuation.
 * @param snapshot - Current thread snapshot.
 * @param currentRunId - Run currently followed by the stream.
 * @param runIds - Selected run IDs; continuation handling may extend this set.
 * @returns The active continuation ID, also added to the selected run set.
 */
export function continuationRun(
  snapshot: ThreadSnapshot,
  currentRunId: string,
  runIds: Set<string>,
): string {
  const current = snapshot.currentRuns.find((candidate) => candidate.runId === currentRunId);
  const active = snapshot.activeRun?.runId;
  if (
    current?.status === "approval-interrupted" &&
    active !== undefined &&
    active !== currentRunId
  ) {
    runIds.add(active);
    return active;
  }
  return currentRunId;
}

/** Translate changed message parts and suppress repeated part content.
 * @param message - Public diagnostic message or browser message.
 * @param sentText - Previously emitted text indexed by message ID.
 * @param sentParts - Previously emitted part digests indexed by part ID.
 * @param toolInputs - Accumulated tool input text indexed by call ID.
 * @returns Text deltas and changed progress or tool frames.
 */
function* browserMessageFrames(
  message: BrowserMessage,
  sentText: Map<string, string>,
  sentParts: Map<string, string>,
  toolInputs: Map<string, string>,
): Iterable<AgentProtocolFrame> {
  if (message.role === "assistant") yield* messageFrames(message, sentText);
  for (const part of message.parts) {
    if (part.kind === "text") continue;
    const digest = JSON.stringify(part.kind === "tool" ? [part.state, part.value] : part.value);
    if (sentParts.get(part.partId) === digest) continue;
    sentParts.set(part.partId, digest);
    if (part.kind === "progress") {
      yield progressFrame(part.partId, part.value, part);
    } else if (part.kind === "tool") {
      yield toolFrame(part, toolInputs);
    }
  }
}

/** Track assistant text and emit only its newly appended suffix.
 * @param message - Public diagnostic message or browser message.
 * @param sent - Previously emitted text indexed by message ID.
 * @returns An initial text-start and any nonempty text delta.
 */
function* messageFrames(
  message: BrowserMessage,
  sent: Map<string, string>,
): Iterable<AgentProtocolFrame> {
  const text = message.parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("");
  const prior = sent.get(message.messageId);
  if (prior === undefined) yield { kind: "text-start", messageId: message.messageId };
  const delta = prior !== undefined && text.startsWith(prior) ? text.slice(prior.length) : text;
  sent.set(message.messageId, text);
  if (delta !== "") yield { kind: "text-delta", messageId: message.messageId, delta };
}

/** Find the latest assistant text accepted during the selected run.
 * @param snapshot - Current thread snapshot.
 * @param acceptedAt - Earliest message timestamp belonging to this run.
 * @returns The first text part of that message, or undefined.
 */
function latestText(snapshot: ThreadSnapshot, acceptedAt: string): string | undefined {
  for (let index = snapshot.currentMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.currentMessages[index]!;
    if (message.role !== "assistant" || message.createdAt < acceptedAt) continue;
    return message.parts.find((part) => part.kind === "text")?.text;
  }
  return undefined;
}
