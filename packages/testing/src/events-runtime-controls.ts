import { normalizeId } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventDeliveryResult, EventRouter } from "@relkit/providers-local";
import type { TestEventCloseOptions } from "./events-types.js";
import type { TestStateRoot } from "./state-root.js";
import type { TestFailureControls } from "./fakes.js";

export interface TestEventControlState {
  readonly router: () => EventRouter;
  readonly log: () => { readonly close: () => Promise<void> };
  readonly open: () => Promise<void>;
  readonly openFanout: (envelope: UnknownEventEnvelope) => Promise<void>;
  readonly owner: TestStateRoot;
  readonly failures: TestFailureControls;
  readonly triggers: readonly {
    readonly id: string;
    readonly eventId: string;
    readonly eventVersion: number;
  }[];
  readonly envelopes: readonly UnknownEventEnvelope[];
  readonly unfanned: Map<string, UnknownEventEnvelope>;
  readonly remember: (result: EventDeliveryResult, envelope: UnknownEventEnvelope) => void;
  readonly isClosed: () => boolean;
  readonly markClosed: () => void;
}

export interface TestEventControls {
  readonly pending: (triggerId?: string) => number;
  readonly runNext: (triggerId?: string) => Promise<EventDeliveryResult | undefined>;
  readonly drain: () => Promise<readonly EventDeliveryResult[]>;
  readonly completed: (triggerId?: string) => number;
  readonly restart: () => Promise<void>;
  readonly close: (options?: TestEventCloseOptions) => Promise<void>;
}

export function createTestEventControls(state: TestEventControlState): TestEventControls {
  const pending = (triggerId?: string): number => {
    ensureOpen();
    const id = triggerId === undefined ? undefined : normalizeId(triggerId);
    const durable = state
      .router()
      .snapshot()
      .deliveries.filter(
        (delivery) =>
          ["available", "leased", "delayed"].includes(delivery.state) &&
          (id === undefined || delivery.triggerId === id),
      ).length;
    const unfanned = [...state.unfanned.values()].filter((envelope) =>
      state.triggers.some(
        (trigger) =>
          (id === undefined || trigger.id === id) &&
          trigger.eventId === envelope.eventId &&
          trigger.eventVersion === envelope.version,
      ),
    ).length;
    return durable + unfanned;
  };
  const runNext = async (triggerId?: string): Promise<EventDeliveryResult | undefined> => {
    ensureOpen();
    for (const envelope of state.unfanned.values()) {
      await state.openFanout(envelope);
    }
    const result = await state.router().runNext(triggerId);
    if (result === undefined) return undefined;
    const envelope = state.envelopes.find((item) => item.instanceId === result.eventInstanceId);
    if (envelope !== undefined) state.remember(result, envelope);
    if (result.state === "completed") state.failures.check("event.after-ack");
    return result;
  };
  const drain = async (): Promise<readonly EventDeliveryResult[]> => {
    const results: EventDeliveryResult[] = [];
    while (true) {
      const result = await runNext();
      if (result === undefined) {
        await state.router().drain();
        return Object.freeze(results);
      }
      results.push(result);
    }
  };
  const completed = (triggerId?: string): number => {
    ensureOpen();
    const id = triggerId === undefined ? undefined : normalizeId(triggerId);
    const durable = state
      .router()
      .snapshot()
      .deliveries.filter(
        (delivery) =>
          delivery.state === "completed" && (id === undefined || delivery.triggerId === id),
      ).length;
    return (
      durable +
      state
        .router()
        .snapshot()
        .triggers.filter((trigger) => id === undefined || trigger.id === id)
        .reduce((sum, trigger) => sum + (trigger.ephemeral?.completed ?? 0), 0)
    );
  };
  const restart = async (): Promise<void> => {
    ensureOpen();
    await state.router().close();
    await state.log().close();
    await state.open();
  };
  const close = async (options: TestEventCloseOptions = {}): Promise<void> => {
    if (state.isClosed()) return;
    state.markClosed();
    await state.router().close();
    await state.log().close();
    state.owner.cleanup(options.failed === true);
  };
  return Object.freeze({ pending, runNext, drain, completed, restart, close });

  function ensureOpen(): void {
    if (state.isClosed()) throw new Error("Test event is closed");
  }
}
