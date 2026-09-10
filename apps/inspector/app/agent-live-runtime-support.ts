import type { AgentView } from "../lib/agents-model";
import type { AgentObservation, ThreadSnapshot } from "./application-runtime-types";

export function completesRunStart(observation: AgentObservation): boolean {
  return (
    (observation.kind !== "event" && observation.snapshot.thread.status !== "running") ||
    (observation.kind === "event" &&
      (observation.event.kind === "run-finished" || observation.event.kind === "run-interrupted"))
  );
}

export function prepareAgentInput(
  view: AgentView,
  status: string,
  input: string,
): { readonly kind: "follow-up" | "run"; readonly payload: unknown } | { readonly error: string } {
  const kind =
    view.chat && status === "running" && view.controls.includes("follow-up") ? "follow-up" : "run";
  if (view.chat || kind !== "run") return { kind, payload: input };
  try {
    return { kind, payload: JSON.parse(input) };
  } catch {
    return { error: "Input must be valid JSON." };
  }
}

export function queuedFollowUps(snapshot?: ThreadSnapshot) {
  return (
    snapshot?.controls.filter(
      (control) =>
        control.kind === "follow-up" &&
        (control.status === "accepted" || control.status === "processing"),
    ) ?? []
  );
}

export function storageKey(
  agentId: string,
  identity: { identityScope: string; sessionEpoch: string },
) {
  return `relkit:inspector:agent:${identity.identityScope}:${identity.sessionEpoch}:${agentId}`;
}

export function setThreadUrl(threadId?: string): void {
  const url = new URL(window.location.href);
  threadId === undefined
    ? url.searchParams.delete("thread")
    : url.searchParams.set("thread", threadId);
  window.history.replaceState(window.history.state, "", url);
}

export function runtimeErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Application operation failed.";
}
