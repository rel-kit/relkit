import { AsyncLocalStorage } from "node:async_hooks";
import type { MaybePromise, OperationId } from "@relkit/contracts";
import type { ChannelDescriptorAny } from "./channel.js";
import type { PresenceSnapshot, TriggerReceipt } from "./types.js";

export interface ChannelTriggerOptions {
  readonly idempotencyKey?: OperationId;
}

export interface RealtimeDispatcher {
  readonly trigger: (request: {
    readonly channel: ChannelDescriptorAny;
    readonly params: unknown;
    readonly event: string;
    readonly payload: unknown;
    readonly options?: ChannelTriggerOptions;
  }) => MaybePromise<TriggerReceipt>;
  readonly getPresence: (request: {
    readonly channel: ChannelDescriptorAny;
    readonly params: unknown;
  }) => MaybePromise<PresenceSnapshot>;
}

const dispatchScope = new AsyncLocalStorage<RealtimeDispatcher>();
let activeDispatcher: RealtimeDispatcher | undefined;

export function setActiveRealtimeDispatcher(dispatcher: RealtimeDispatcher | undefined): void {
  activeDispatcher = dispatcher;
}

export function runWithRealtimeDispatcher<Value>(
  dispatcher: RealtimeDispatcher,
  action: () => Value,
): Value {
  return dispatchScope.run(dispatcher, action);
}

export function currentRealtimeDispatcher(): RealtimeDispatcher {
  const dispatcher = dispatchScope.getStore() ?? activeDispatcher;
  if (dispatcher === undefined) throw new Error("No realtime dispatcher is active.");
  return dispatcher;
}
