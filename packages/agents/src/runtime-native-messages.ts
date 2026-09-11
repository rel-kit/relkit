import type { BrowserMessage } from "@relkit/contracts";
import type { AgentExecutionEvent } from "./runtime-events.js";

interface MessageState {
  readonly messageId: string;
  readonly createdAt: string;
  readonly parts: Map<number, string>;
}

export class NativeMessageAccumulator {
  private readonly messages = new Map<string, MessageState>();

  update(event: AgentExecutionEvent): BrowserMessage | undefined {
    if (event.kind !== "messages" || !isRecord(event.value)) return undefined;
    const value = event.value;
    const key = [...event.scope, event.node ?? ""].join("\u0000");
    if (value.event === "message-start") {
      if (value.role !== undefined && value.role !== "ai") {
        this.messages.delete(key);
        return undefined;
      }
      const messageId = text(value.id);
      if (messageId === undefined) return undefined;
      this.messages.set(key, {
        messageId,
        createdAt: event.occurredAt,
        parts: new Map(),
      });
      return undefined;
    }
    const current = this.messages.get(key);
    if (current === undefined) return undefined;
    const index = typeof value.index === "number" ? value.index : 0;
    if (value.event === "content-block-delta") {
      const delta = text(isRecord(value.delta) ? value.delta.text : undefined);
      if (delta !== undefined) current.parts.set(index, (current.parts.get(index) ?? "") + delta);
    } else if (value.event === "content-block-start" || value.event === "content-block-finish") {
      const content = text(isRecord(value.content) ? value.content.text : undefined);
      if (content !== undefined) current.parts.set(index, content);
    }
    const complete = value.event === "message-finish";
    if (complete) this.messages.delete(key);
    if (current.parts.size === 0) return undefined;
    return {
      messageId: current.messageId,
      role: "assistant",
      parts: [...current.parts]
        .sort(([left], [right]) => left - right)
        .map(([partIndex, partText]) => ({
          partId: `${current.messageId}:text:${partIndex}`,
          kind: "text" as const,
          text: partText,
          state: complete ? ("complete" as const) : ("streaming" as const),
        })),
      createdAt: current.createdAt,
    };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
