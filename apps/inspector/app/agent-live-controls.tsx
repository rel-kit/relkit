import { Activity, ArrowLeft, CornerDownRight, History, Plus, Send, Square } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Button } from "../components/ui/button";
import type { AgentView } from "../lib/agents-model";

export function AgentChatHeader({
  view,
  runtimeStatus,
  threadId,
  status,
  pending,
  onNew,
  onStop,
  onActivity,
  onHistory,
}: {
  readonly view: AgentView;
  readonly runtimeStatus: string;
  readonly threadId: string;
  readonly status: string;
  readonly pending: boolean;
  readonly onNew: () => void;
  readonly onStop: () => void;
  readonly onActivity: () => void;
  readonly onHistory: () => void;
}) {
  const canStop =
    view.controls.includes("stop") &&
    (status === "running" || status === "approval-interrupted" || status === "stopping");
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Link
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
          href={`/agents/${encodeURIComponent(view.id)}`}
          aria-label="Agent details"
          title="Agent details"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
        </Link>
        <div className="grid min-w-0 gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="m-0 truncate text-[15px] font-semibold text-foreground">{view.id}</h1>
            <StatusBadge
              tone={view.client === "internal" ? "neutral" : "info"}
              label={view.client}
            />
            <StatusBadge tone={statusTone(runtimeStatus)} label={runtimeStatus} />
          </div>
          <p className="m-0 truncate font-mono text-[11px] text-muted-foreground">
            thread{" "}
            <code className="text-foreground/85">{threadId || "created on first message"}</code>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="Thread history" onPress={onHistory}>
          <History aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="sm" onPress={onNew}>
          <Plus aria-hidden="true" /> New chat
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={pending || threadId === "" || !canStop}
          onPress={onStop}
        >
          <Square aria-hidden="true" /> Stop
        </Button>
        <Button variant="secondary" size="sm" className="min-[1100px]:hidden" onPress={onActivity}>
          <Activity aria-hidden="true" /> Events
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        Agent status: {status}
      </span>
    </header>
  );
}

export function AgentComposer({
  view,
  value,
  status,
  queued,
  pending,
  runtimeStatus,
  onValueChange,
  onSteer,
  onSubmit,
}: {
  readonly view: AgentView;
  readonly value: string;
  readonly status: string;
  readonly queued: readonly { readonly controlId: string; readonly publicPayload?: unknown }[];
  readonly pending: boolean;
  readonly runtimeStatus: string;
  readonly onValueChange: (value: string) => void;
  readonly onSteer: () => void;
  readonly onSubmit: (event: FormEvent) => void;
}) {
  const running = status === "running";
  const queuesFollowUp = running && view.chat && view.controls.includes("follow-up");
  const disabled =
    pending ||
    runtimeStatus !== "ready" ||
    value.trim() === "" ||
    status === "waiting" ||
    (running && !queuesFollowUp);
  return (
    <form className="grid gap-2 border-t border-border bg-card p-3" onSubmit={onSubmit}>
      {queued.length === 0 ? null : (
        <ul className="m-0 grid list-none gap-1 p-0" aria-label="Queued follow-ups">
          {queued.map((control) => (
            <li
              key={control.controlId}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                Queued follow-up
              </span>
              <p className="m-0 truncate">{String(control.publicPayload ?? "")}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mx-auto w-full max-w-3xl">
        <label className="sr-only" htmlFor="agent-message">
          {view.chat ? "Message the agent" : "Agent JSON input"}
        </label>
        <textarea
          id="agent-message"
          rows={3}
          value={value}
          placeholder={view.chat ? "Message the agent…" : "Enter JSON input…"}
          className={`block max-h-56 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 pt-2.5 pr-32 pb-10 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25 ${view.chat ? "" : "font-mono text-xs"}`}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <span className="hidden font-mono text-[10.5px] text-muted-foreground/70 sm:inline">
            ⏎ send · ⇧⏎ newline
          </span>
          {running && view.controls.includes("steer") ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={pending || value.trim() === ""}
              onPress={onSteer}
            >
              <CornerDownRight aria-hidden="true" /> Steer
            </Button>
          ) : null}
          <Button
            type="submit"
            size="icon"
            className="size-7"
            aria-label={queuesFollowUp ? "Queue follow-up" : "Send message"}
            isDisabled={disabled}
          >
            <Send aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}
