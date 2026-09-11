import { Bot } from "lucide-react";
import { Streamdown } from "streamdown";
import { Button } from "../components/ui/button";
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
  readonly optimisticMessage?: string;
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
    <section className="agent-conversation" aria-label="Conversation">
      <MessageScroller aria-live="polite">
        {error === "" ? null : (
          <p className="agent-chat-error" role="alert">
            {error}
          </p>
        )}
        <AgentPublicState values={snapshot?.values} />
        {messages.length === 0 && optimisticMessage === undefined ? (
          <div className="agent-empty-state">
            <Bot aria-hidden="true" />
            <h3>Start a conversation</h3>
            <p>Messages, tool activity, progress, and approvals will appear here in order.</p>
          </div>
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
          <div className="agent-response-pending" role="status">
            <span>{status === "stopping" ? "Stopping…" : "Thinking..."}</span>
          </div>
        ) : null}
        {snapshot?.approvals
          .filter((approval) => approval.status === "open")
          .map((approval) => (
            <article className="agent-approval" key={approval.approvalId}>
              <div>
                <strong>Approval required</strong>
                <p>{summary(approval.publicRequest)}</p>
              </div>
              <div>
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
      <div className="agent-tool-message">
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
