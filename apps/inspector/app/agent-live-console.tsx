"use client";

import { useState, type FormEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import type { AgentView } from "../lib/agents-model";
import { AgentActivityPanel } from "./agent-activity-panel";
import { AgentChatHeader, AgentComposer } from "./agent-live-controls";
import { useAgentLiveRuntime } from "./agent-live-runtime";
import { AgentLiveState } from "./agent-live-state";
import type { ThreadListItem } from "./application-runtime-types";

export function AgentLiveConsole({ view }: { readonly view: AgentView }) {
  const agent = useAgentLiveRuntime(view);
  const [activityOpen, setActivityOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<readonly ThreadListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pendingUser, setPendingUser] = useState<{
    readonly text: string;
    readonly afterMessageId?: string;
  }>();
  const lastUserId = agent.conversation.messages.findLast(
    (message) => message.role === "user",
  )?.messageId;
  const optimisticMessage =
    pendingUser?.afterMessageId === lastUserId && agent.error === ""
      ? pendingUser?.text
      : undefined;

  function send(event: FormEvent) {
    if (view.chat && agent.status !== "running" && agent.input.trim() !== "")
      setPendingUser({ text: agent.input, afterMessageId: lastUserId });
    agent.send(event);
  }

  if (view.client === "internal")
    return (
      <p className="agent-chat-unavailable">
        This internal agent has no application chat endpoint.
      </p>
    );
  return (
    <div className="agent-chat-page">
      <AgentChatHeader
        view={view}
        runtimeStatus={agent.runtimeStatus}
        threadId={agent.threadId}
        status={agent.status}
        pending={agent.pending}
        onNew={() => {
          setPendingUser(undefined);
          agent.newChat();
        }}
        onStop={() => void agent.submit("stop", { mode: "graceful" })}
        onActivity={() => setActivityOpen(true)}
        onHistory={() => {
          setHistoryOpen(true);
          setHistoryLoading(true);
          setHistoryError("");
          void agent
            .listThreads()
            .then((result) => setHistory(result.threads))
            .catch((cause) =>
              setHistoryError(cause instanceof Error ? cause.message : "Thread history failed."),
            )
            .finally(() => setHistoryLoading(false));
        }}
      />
      <div className="agent-chat-grid">
        <AgentLiveState
          state={agent.conversation}
          status={agent.status}
          optimisticMessage={optimisticMessage}
          error={agent.error}
          pending={agent.pending}
          onApproval={(approvalId, decision) =>
            void agent.submit("approve", { approvalId, decision })
          }
          onResume={agent.resume}
        />
        <AgentActivityPanel state={agent.conversation} />
      </div>
      <AgentComposer
        view={view}
        value={agent.input}
        status={agent.status}
        queued={agent.queuedFollowUps}
        pending={agent.pending}
        runtimeStatus={agent.runtimeStatus}
        onValueChange={agent.setInput}
        onSteer={agent.steer}
        onSubmit={send}
      />
      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent className="agent-activity-sheet">
          <SheetHeader>
            <SheetTitle>Events</SheetTitle>
            <SheetDescription>Current run, tools, events, and IDs.</SheetDescription>
          </SheetHeader>
          <AgentActivityPanel state={agent.conversation} />
        </SheetContent>
      </Sheet>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="agent-activity-sheet">
          <SheetHeader>
            <SheetTitle>Thread history</SheetTitle>
            <SheetDescription>Select an authorized conversation to restore.</SheetDescription>
          </SheetHeader>
          {historyError !== "" ? (
            <p className="agent-history-empty" role="alert">
              {historyError}
            </p>
          ) : historyLoading ? (
            <p className="agent-history-empty">Loading threads…</p>
          ) : history.length === 0 ? (
            <p className="agent-history-empty">No previous threads.</p>
          ) : (
            <ul className="agent-thread-history">
              {history.map((thread) => (
                <li key={thread.threadId}>
                  <button
                    type="button"
                    aria-current={thread.threadId === agent.threadId ? "true" : undefined}
                    onClick={() => {
                      setHistoryOpen(false);
                      void agent.restore(thread.threadId);
                    }}
                  >
                    <strong>{thread.preview ?? "New conversation"}</strong>
                    <span>{thread.status}</span>
                    <time dateTime={thread.updatedAt}>
                      {new Date(thread.updatedAt).toLocaleString()}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
