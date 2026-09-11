import { Activity, ArrowLeft, CornerDownRight, History, Plus, Send, Square } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { Badge } from "../components/ui/badge";
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
    <header className="agent-chat-header">
      <div className="agent-chat-identity">
        <Link className="agent-back-link" href={`/agents/${encodeURIComponent(view.id)}`}>
          <ArrowLeft aria-hidden="true" /> Agent details
        </Link>
        <div className="agent-chat-title">
          <h1>{view.id}</h1>
          <Badge>{view.client}</Badge>
          <Badge>{runtimeStatus}</Badge>
        </div>
        <p>
          Thread <code>{threadId || "created on first message"}</code>
        </p>
      </div>
      <div className="agent-chat-actions">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Thread history"
          title="Thread history"
          onPress={onHistory}
        >
          <History aria-hidden="true" />
        </Button>
        <Button variant="secondary" onPress={onNew}>
          <Plus aria-hidden="true" /> New chat
        </Button>
        <Button
          variant="secondary"
          isDisabled={pending || threadId === "" || !canStop}
          onPress={onStop}
        >
          <Square aria-hidden="true" /> Stop
        </Button>
        <Button variant="secondary" className="agent-activity-trigger" onPress={onActivity}>
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
    <form className="agent-composer" onSubmit={onSubmit}>
      {queued.length === 0 ? null : (
        <ul className="agent-queued-followups" aria-label="Queued follow-ups">
          {queued.map((control) => (
            <li key={control.controlId}>
              <span>Queued follow-up</span>
              <p>{String(control.publicPayload ?? "")}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="agent-composer-input">
        <label className="sr-only" htmlFor="agent-message">
          {view.chat ? "Message the agent" : "Agent JSON input"}
        </label>
        <textarea
          id="agent-message"
          rows={3}
          value={value}
          placeholder={view.chat ? "Message the agent…" : "Enter JSON input…"}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="agent-composer-actions">
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
            aria-label={queuesFollowUp ? "Queue follow-up" : "Send message"}
            title={queuesFollowUp ? "Queue follow-up" : "Send message"}
            isDisabled={disabled}
          >
            <Send aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}
