import { Bot, ShieldAlert } from "lucide-react";
import { Streamdown } from "streamdown";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/neon/empty-state";
import { Bubble, Message, MessageScroller } from "../components/ui/message";
import type { AgentConversationState } from "./agent-observation";
import { AgentResumeForm } from "./agent-resume-form";
import { AgentPublicState } from "./agent-public-state";
import { AgentToolAccordion } from "./agent-tool-accordion";
import type { BrowserMessage, BrowserMessagePart } from "./application-runtime-types";

export function AgentLiveState({
  state,
  status,
  optimisticMessage,
  error,
  pending,
  onApproval,
  onResume,
}: {
  readonly state: AgentConversationState;
  readonly status: string;
  readonly optimisticMessage?: string | undefined;
  readonly error: string;
  readonly pending: boolean;
  readonly onApproval: (approvalId: string, decision: "approve" | "deny") => void;
  readonly onResume: (reply: unknown) => void;
}) {
  const snapshot = state.snapshot;
  const messages = state.messages.filter(isVisibleMessage);
  const latestUser = messages.findLast((message) => message.role === "user");
  const latestAssistant = messages.findLast((message) => message.role === "assistant");
  const hasCurrentAssistantText =
    optimisticMessage === undefined &&
    latestAssistant?.runId !== undefined &&
    latestAssistant.runId === latestUser?.runId &&
    latestAssistant.parts.some((part) => part.kind === "text" && part.text.length > 0);
  const thinking = status === "running" && !hasCurrentAssistantText;
  return (
    <section
      className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      aria-label="Conversation"
    >
      <header className="flex h-9 items-center justify-between gap-2 border-b border-border/70 px-4">
        <h2 className="m-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Conversation
        </h2>
        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </span>
      </header>
      <MessageScroller aria-live="polite">
        {error === "" ? null : (
          <p
            className="m-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        <AgentPublicState values={snapshot?.values} />
        {messages.length === 0 && optimisticMessage === undefined ? (
          <EmptyState
            variant="bare"
            size="md"
            icon={<Bot />}
            title="Start a conversation"
            description="Messages, tool activity, progress, and approvals will appear here in order."
          />
        ) : (
          messages.map((message) => (
            <AgentMessage
              key={message.messageId}
              message={message}
              state={state}
              streaming={
                status === "running" &&
                message.messageId === latestAssistant?.messageId &&
                !isCompleteMessage(message)
              }
            />
          ))
        )}
        {optimisticMessage === undefined ? null : (
          <Message role="user" label="Sending user message">
            <Bubble>
              <p>{optimisticMessage}</p>
            </Bubble>
          </Message>
        )}
        {status === "stopping" || thinking ? (
          <div
            className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
            role="status"
          >
            <span
              aria-hidden="true"
              className="neon-status-breathe size-1.5 rounded-[1px] bg-live text-live"
            />
            <span>{status === "stopping" ? "Stopping…" : "Thinking..."}</span>
          </div>
        ) : null}
        {snapshot?.approvals
          .filter((approval) => approval.status === "open")
          .map((approval) => (
            <article
              className="flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-soft/40 px-3 py-2.5"
              key={approval.approvalId}
            >
              <div className="flex min-w-0 items-start gap-2">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <div className="min-w-0">
                  <strong className="text-xs font-semibold text-foreground">
                    Approval required
                  </strong>
                  <p className="m-0 truncate font-mono text-[11px] text-muted-foreground">
                    {summary(approval.publicRequest)}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={pending}
                  onPress={() => onApproval(approval.approvalId, "deny")}
                >
                  Deny
                </Button>
                <Button
                  size="sm"
                  isDisabled={pending}
                  onPress={() => onApproval(approval.approvalId, "approve")}
                >
                  Approve
                </Button>
              </div>
            </article>
          ))}
        {snapshot?.waiting === undefined ? null : (
          <AgentResumeForm waiting={snapshot.waiting} pending={pending} onResume={onResume} />
        )}
      </MessageScroller>
    </section>
  );
}

function AgentMessage({
  message,
  state,
  streaming,
}: {
  readonly message: BrowserMessage;
  readonly state: AgentConversationState;
  readonly streaming: boolean;
}) {
  if (message.role === "tool") {
    const tools = message.parts.filter(isTool);
    if (tools.length === 0) return null;
    const progress = state.messages.flatMap((item) => item.parts).filter(isProgress);
    return (
      <div className="grid w-full gap-1.5" aria-label="Tool calls" role="group">
        {tools.map((tool) => (
          <AgentToolAccordion
            key={tool.toolCallId}
            tool={tool}
            progress={progress.filter((item) => item.toolCallId === tool.toolCallId)}
            events={state.events}
          />
        ))}
      </div>
    );
  }
  return (
    <Message
      role={message.role}
      label={message.role === "user" ? "User message" : "Assistant message"}
    >
      <Bubble>
        {message.parts.filter(isText).map((part) =>
          message.role === "assistant" ? (
            <Streamdown
              key={part.partId}
              className="agent-markdown"
              controls={false}
              skipHtml
              isAnimating={streaming}
            >
              {part.text}
            </Streamdown>
          ) : (
            <p key={part.partId}>{part.text}</p>
          ),
        )}
      </Bubble>
    </Message>
  );
}

function isVisibleMessage(message: BrowserMessage): boolean {
  return message.role !== "tool" || message.parts.some(isTool);
}

function isText(
  part: BrowserMessagePart,
): part is Extract<BrowserMessagePart, { readonly kind: "text" }> {
  return part.kind === "text";
}

function isCompleteMessage(message: BrowserMessage): boolean {
  return message.parts.some((part) => part.kind === "text" && part.state === "complete");
}

function isTool(
  part: BrowserMessagePart,
): part is Extract<BrowserMessagePart, { readonly kind: "tool" }> {
  return part.kind === "tool";
}

function isProgress(
  part: BrowserMessagePart,
): part is Extract<BrowserMessagePart, { readonly kind: "progress" }> {
  return part.kind === "progress" && part.scope === "tool";
}

function summary(value: unknown): string {
  if (value && typeof value === "object" && "toolId" in value)
    return `Allow ${String(value.toolId)} to continue?`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined ? "Review this tool request before continuing." : text;
}
