import { Schema } from "effect";

/** Discriminated browser message content retained without converting opaque payloads. */
const MessagePart = Schema.Union([
  Schema.Struct({
    partId: Schema.String,
    kind: Schema.Literal("text"),
    text: Schema.String,
    state: Schema.optionalKey(Schema.Literals(["streaming", "complete"])),
  }),
  Schema.Struct({
    partId: Schema.String,
    kind: Schema.Literal("tool"),
    toolCallId: Schema.String,
    toolId: Schema.String,
    state: Schema.Literals([
      "started",
      "input-streaming",
      "input-ready",
      "approval-required",
      "running",
      "succeeded",
      "failed",
      "denied",
    ]),
    inputText: Schema.optionalKey(Schema.String),
    input: Schema.optionalKey(Schema.Unknown),
    output: Schema.optionalKey(Schema.Unknown),
    value: Schema.optionalKey(Schema.Unknown),
  }),
  Schema.Struct({
    partId: Schema.String,
    kind: Schema.Literal("progress"),
    value: Schema.Unknown,
    scope: Schema.Literal("run"),
  }),
  Schema.Struct({
    partId: Schema.String,
    kind: Schema.Literal("progress"),
    value: Schema.Unknown,
    scope: Schema.Literal("tool"),
    toolCallId: Schema.String,
    toolId: Schema.String,
  }),
]);

/** Persisted message identity and ordered content parts. */
export const AgentMessage = Schema.Struct({
  messageId: Schema.String,
  runId: Schema.optionalKey(Schema.String),
  role: Schema.Literals(["user", "assistant", "tool"]),
  parts: Schema.Array(MessagePart),
  createdAt: Schema.String,
});

/** Paused execution response contract remains JSON-compatible across restarts. */
export const AgentWaiting = Schema.Struct({
  revision: Schema.String,
  runId: Schema.String,
  response: Schema.Json,
  requests: Schema.Array(
    Schema.Struct({
      node: Schema.String,
      value: Schema.optionalKey(Schema.Unknown),
      response: Schema.Json,
    }),
  ),
});
