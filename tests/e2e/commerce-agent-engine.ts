/** Dispatches browser fixture requests through native schemas, streaming and explicit local provider replacements. */
import { invokeAgent } from "../../packages/agents/src/index.ts";
import type { HttpInvocationOptions } from "../../packages/runtime-hono/src/index.ts";
import type { RealtimeDispatcher } from "../../packages/realtime/src/index.ts";
import announcements from "../../examples/commerce/src/services/announcements/channels/announcements.channel.ts";
import postAnnouncement from "../../examples/commerce/src/services/announcements/functions/post-announcement.function.ts";
import cancelOrder from "../../examples/commerce/src/services/orders/tools/cancel-order.tool.ts";
import lookupOrder from "../../examples/commerce/src/services/orders/tools/lookup-order.tool.ts";
import type { AgentContentSink } from "../../packages/agents/src/index.ts";

/**
 * Captures native fixture observers and dispatches each accepted HTTP invocation.
 * @param agent - Native SDK declaration retaining inference.
 * @param dispatcher - Explicit realtime provider dispatcher.
 * @returns The fixture's native HTTP engine.
 */
export function commerceAgentEngine(
  agent: Parameters<typeof invokeAgent>[0]["agent"],
  dispatcher: RealtimeDispatcher,
) {
  const announcementMessages: string[] = [];
  return {
    /**
     * Dispatches an admitted runtime request through native SDK streaming or fixture-local announcement state.
     * @param request - Runtime-authored invocation retaining cancellation and transport identity.
     * @returns Native public output after the actual schema and provider operations settle.
     */
    invoke: async (request: HttpInvocationOptions) => {
      if (request.functionId === "announcements.get-announcements")
        return { messages: announcementMessages };
      if (request.functionId === "announcements.post-announcement") {
        const { message } = postAnnouncement.input.parse(request.input);
        announcementMessages.push(message);
        await dispatcher.trigger({
          channel: nativeAnnouncementChannel(),
          params: {},
          event: "posted",
          payload: { message, postedAt: new Date().toISOString() },
        });
        return { accepted: true };
      }
      const trigger = nativeAgentTrigger(request);
      return invokeAgent({
        agent,
        input: request.input,
        threadId: trigger.threadId,
        tools: [lookupOrder, cancelOrder],
        engine: { invoke: () => Promise.reject(new Error("Unexpected RELKIT tool invocation.")) },
        contentSink: trigger.contentSink,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    },
  };
}

/**
 * Guards the native streamed-agent trigger at the HTTP SDK boundary.
 * @param request - Runtime-authored agent invocation.
 * @returns Its validated thread and content-sink operations.
 */
function nativeAgentTrigger(request: HttpInvocationOptions) {
  const trigger = request.trigger;
  if (typeof trigger !== "object" || trigger === null)
    throw new TypeError("Missing native agent trigger");
  const threadId = Reflect.get(trigger, "threadId");
  const contentSink = Reflect.get(trigger, "contentSink");
  if (typeof threadId !== "string" || typeof contentSink !== "object" || contentSink === null)
    throw new TypeError("Invalid native streamed-agent trigger");
  if (typeof Reflect.get(contentSink, "emitOutput") !== "function")
    throw new TypeError("Native content sink must retain output emission");
  for (const method of [
    "finishOutput",
    "progressSinkForTool",
    "emitTool",
    "emitEvent",
    "emitMessage",
    "emitWaiting",
  ]) {
    const value = Reflect.get(contentSink, method);
    if (value !== undefined && typeof value !== "function")
      throw new TypeError("Invalid native content sink operation");
  }
  // The runtime owns this SDK-created sink and its callback argument contracts.
  // Guard its finite operation shape, then borrow the identical object through the native ABI.
  return { threadId, contentSink: contentSink as AgentContentSink };
}

/**
 * Supplies the known public channel's native ABI without its explicitly absent presence declaration.
 * @returns Native channel metadata retaining the same ID, event schemas and access policy.
 */
function nativeAnnouncementChannel(): Parameters<RealtimeDispatcher["trigger"]>[0]["channel"] {
  const { presence: _absentPresence, ...channel } = announcements;
  return channel;
}
