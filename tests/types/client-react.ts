import {
  useAgent,
  useChannel,
  useRoute,
  useStream,
  type ClientAgentContract,
  type ClientAgentDynamic,
  type ClientChannelContract,
  type ClientRouteContract,
  type ClientStreamContract,
  type CountPresence,
} from "@relkit/client/react";

declare function expectType<Value>(value: Value): void;

declare module "@relkit/client/react" {
  interface ClientRegistry {
    readonly finite: ClientRouteContract<{ id: string }, { value: string }> & {
      readonly operation: "query";
    };
    readonly streaming: ClientStreamContract<{ id: string }, { progress: number }> & {
      readonly operation: "query";
    };
  }
  interface ChannelRegistry {
    readonly count: ClientChannelContract<
      { id: string },
      { changed: { value: number } },
      CountPresence
    >;
    readonly events: ClientChannelContract<{ id: string }, { changed: { value: number } }>;
  }
  interface AgentRegistry {
    readonly chat: ClientAgentContract<
      { message: string },
      { answer: string },
      "stop" | "approve",
      true,
      never,
      ClientAgentDynamic
    >;
    readonly task: ClientAgentContract<{ id: string }, { done: boolean }, "steer", false>;
    readonly graph: ClientAgentContract<
      { orderId: string },
      { done: boolean },
      "stop",
      false,
      boolean | { reason: string },
      never,
      Readonly<Record<never, never>>,
      never,
      { readonly kind: "node"; readonly id: "approve" },
      {
        readonly node: "approve";
        readonly response: import("@relkit/contracts").JsonValue;
      }
    >;
    readonly exact: ExactContract;
  }
}

useRoute("finite", { input: { id: "one" } });
useStream("streaming", { input: { id: "one" } });
// @ts-expect-error stream selectors are excluded from finite hooks
useRoute("streaming", { input: { id: "one" } });

const count = useChannel("count", { params: { id: "one" } });
count.presence.connections;
const events = useChannel("events", { params: { id: "one" } });
// @ts-expect-error channels without presence expose no presence property
events.presence;

const chat = useAgent("chat");
chat.send("hello", { threadId: "conversation:one" });
chat.observe({ threadId: "conversation:one" });
chat.stop({ threadId: "conversation:one" });
chat.stop({ threadId: "conversation:one", mode: "immediate" });
chat.deny("approval", { threadId: "conversation:one" });
chat.approve("approval", { threadId: "conversation:one" });
// @ts-expect-error graph continuation uses run with resume rather than interrupt bookkeeping
chat.respondToInterrupts({ "approval:one": "approve" }, { threadId: "conversation:one" });
// @ts-expect-error the hook never selects or restores a thread implicitly
useAgent("chat", { threadId: "conversation:one" });
// @ts-expect-error each execution requires an application-owned thread ID
chat.send("hello");
// @ts-expect-error each observation requires an application-owned thread ID
chat.observe();
// @ts-expect-error each control requires an application-owned thread ID
chat.stop();
const clientEvent = chat.events[0];
if (clientEvent?.kind === "tool-executing") clientEvent.toolId;
if (clientEvent?.kind === "tool-succeeded") clientEvent.output;
if (clientEvent?.kind === "progress" && clientEvent.scope === "tool") {
  clientEvent.toolId;
  clientEvent.toolCallId;
}
if (clientEvent?.kind === "progress" && clientEvent.scope === "run") {
  // @ts-expect-error run progress is not associated with a tool
  clientEvent.toolCallId.toUpperCase();
}
const timelineItem = chat.timeline[0];
if (timelineItem?.kind === "tool") {
  chat.toolCallsById.get(timelineItem.toolCall.toolCallId)?.state;
  chat.timelineById.get(timelineItem.key);
}
// @ts-expect-error chat agents expose send rather than run
chat.run({ message: "hello" });
// @ts-expect-error undeclared control methods are absent
chat.steer("change", { threadId: "conversation:one" });

const task = useAgent("task");
task.run({ id: "one" }, { threadId: "task:one" });
task.run({ id: "one" }, { threadId: "task:one", resume: false });
task.steer("change", { threadId: "task:one" });
// @ts-expect-error each execution requires an application-owned thread ID
task.run({ id: "one" });
// @ts-expect-error non-chat agents expose run rather than send
task.send("hello");
// @ts-expect-error approval methods require the approve capability
task.approve("approval", { threadId: "task:one" });
// @ts-expect-error agents without a waiting contract expose no waiting state
task.waiting?.revision;

const graph = useAgent("graph");
graph.run({ orderId: "one" }, { threadId: "order:one" });
graph.run(true, { threadId: "order:one", resume: true });
graph.run({ reason: "needs changes" }, { threadId: "order:one", resume: true });
graph.waiting?.revision.toUpperCase();
graph.waiting?.requests[0]?.response;

type ExactContract = ClientAgentContract<
  { orderId: string },
  { done: boolean },
  "stop",
  false,
  boolean,
  {
    readonly kind: "tool";
    readonly id: "lookup";
    readonly input: { id: string };
    readonly output: { found: boolean };
  },
  { readonly todos: readonly { readonly status: "pending" | "completed" }[] },
  { readonly kind: "custom"; readonly name: "notice"; readonly data: { message: string } },
  { readonly kind: "node"; readonly id: "review" },
  {
    readonly node: "review";
    readonly value?: unknown;
    readonly response: import("@relkit/contracts").JsonValue;
  }
>;
declare const exactContract: ExactContract;
exactContract.tool.input.id.toUpperCase();
exactContract.publicState.todos[0]?.status;
exactContract.customEvent.data.message.toUpperCase();
exactContract.scope.id;
exactContract.waiting.node.toUpperCase();

const exact = useAgent("exact");
exact.values?.todos[0]?.status;
exact.output?.done;
exact.toolCalls[0]?.input?.id.toUpperCase();
exact.toolCalls[0]?.output?.found.valueOf();
expectType<"lookup" | undefined>(exact.toolCalls[0]?.toolId);
expectType<"review" | undefined>(exact.executions[0]?.node);
exact.executions[0]?.values?.todos[0]?.status;
expectType<"review" | undefined>(exact.waiting?.requests[0]?.node);
exact.snapshot?.values?.todos[0]?.status;
exact.snapshot?.output?.done.valueOf();
const exactEvent = exact.events[0];
if (exactEvent?.kind === "tool-input-ready") {
  exactEvent.input.id.toUpperCase();
  // @ts-expect-error exact tool events exclude undeclared input keys
  exactEvent.input.query;
}
if (exactEvent?.kind === "tool-succeeded") exactEvent.output.found.valueOf();
if (exactEvent?.kind === "custom") {
  expectType<"notice">(exactEvent.name);
  exactEvent.data.message.toUpperCase();
  // @ts-expect-error exact declared custom-event payload rejects the wrong field
  exactEvent.data.reason;
}
// @ts-expect-error selected public state excludes undeclared keys
exact.values?.privateState;
// @ts-expect-error exact output excludes undeclared keys
exact.output?.answer;
// @ts-expect-error known nested executions exclude undeclared node IDs
expectType<"other" | undefined>(exact.executions[0]?.node);
// @ts-expect-error waiting requests preserve their declared node IDs
expectType<"other" | undefined>(exact.waiting?.requests[0]?.node);
// @ts-expect-error waiting revisions are inferred from the snapshot, not supplied by callers
graph.run(true, { threadId: "order:one", resume: true, waitingRevision: "revision:one" });
// @ts-expect-error continuation replies require the resume discriminator
graph.run(true, { threadId: "order:one" });
// @ts-expect-error initial inputs cannot be sent as continuation replies
graph.run({ orderId: "one" }, { threadId: "order:one", resume: true });
// @ts-expect-error agents without graph resume schemas cannot resume
task.run({ id: "one" }, { threadId: "task:one", resume: true });
// @ts-expect-error chat sends are initial messages, not continuation replies
chat.send("hello", { threadId: "conversation:one", resume: true });
