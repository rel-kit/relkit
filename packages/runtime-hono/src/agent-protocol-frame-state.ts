import type { AgentClientEvent, BrowserMessage, ThreadSnapshot } from "@relkit/agents";
import { progressFrame } from "./agent-protocol-progress.js";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";
import { toolEventFrame, toolFrame } from "./agent-protocol-tool.js";

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

export function terminalRun(snapshot: ThreadSnapshot, runId: string): boolean {
  const run = snapshot.currentRuns.find((candidate) => candidate.runId === runId);
  return (
    run !== undefined &&
    ["succeeded", "failed", "cancelled", "worker-interrupted"].includes(run.status)
  );
}

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

function latestText(snapshot: ThreadSnapshot, acceptedAt: string): string | undefined {
  for (let index = snapshot.currentMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.currentMessages[index]!;
    if (message.role !== "assistant" || message.createdAt < acceptedAt) continue;
    return message.parts.find((part) => part.kind === "text")?.text;
  }
  return undefined;
}
