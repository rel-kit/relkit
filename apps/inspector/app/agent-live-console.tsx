"use client";

import { useState, type FormEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { ArrowLeft, Bot, History } from "lucide-react";
import Link from "next/link";
import { LoadingRows } from "../components/blocks/block-state";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import type { AgentView } from "../lib/agents-model";
import { relativeTime } from "../lib/format";
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
      setPendingUser({
        text: agent.input,
        ...(lastUserId === undefined ? {} : { afterMessageId: lastUserId }),
      });
    agent.send(event);
  }

  if (view.client === "internal")
    return (
      <div className="route-page">
        <EmptyState
          icon={<Bot />}
          title="This internal agent has no application chat endpoint."
          description="Internal agents run from functions and graphs; inspect their spans on the agent detail page."
          action={
            <Link
              href={`/agents/${encodeURIComponent(view.id)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-foreground no-underline hover:bg-muted"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" /> Agent details
            </Link>
          }
        />
      </div>
    );
  return (
    <div className="grid h-[calc(100dvh-6.4rem)] min-h-[28rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-border bg-card">
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
      <div className="grid min-h-0 overflow-hidden min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
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
        <AgentActivityPanel
          state={agent.conversation}
          className="hidden border-l border-border min-[1100px]:grid"
        />
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
          <AgentActivityPanel state={agent.conversation} className="bg-transparent p-0" />
        </SheetContent>
      </Sheet>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="agent-activity-sheet">
          <SheetHeader>
            <SheetTitle>Thread history</SheetTitle>
            <SheetDescription>Select an authorized conversation to restore.</SheetDescription>
          </SheetHeader>
          {historyError !== "" ? (
            <p className="m-0 text-xs text-danger" role="alert">
              {historyError}
            </p>
          ) : historyLoading ? (
            <LoadingRows label="Loading threads…" rows={4} className="p-0" />
          ) : history.length === 0 ? (
            <EmptyState variant="bare" size="sm" icon={<History />} title="No previous threads." />
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0">
              {history.map((thread) => (
                <li key={thread.threadId}>
                  <button
                    type="button"
                    aria-current={thread.threadId === agent.threadId ? "true" : undefined}
                    className="grid w-full gap-1 rounded-md border border-transparent px-2.5 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=true]:border-border aria-[current=true]:bg-muted/60"
                    onClick={() => {
                      setHistoryOpen(false);
                      void agent.restore(thread.threadId);
                    }}
                  >
                    <strong className="truncate text-[13px] font-medium text-foreground">
                      {thread.preview ?? "New conversation"}
                    </strong>
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={statusTone(thread.status)} label={thread.status} />
                      <time
                        dateTime={thread.updatedAt}
                        title={thread.updatedAt}
                        className="font-mono text-[10.5px] text-muted-foreground tabular-nums"
                      >
                        {relativeTime(thread.updatedAt)}
                      </time>
                    </span>
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
