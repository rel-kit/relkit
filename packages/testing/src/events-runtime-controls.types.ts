import type { Effect } from "effect";
import type { WorkOwnershipState } from "./work-ownership.types.js";
import type { EventProvider, UnknownEventEnvelope } from "@relkit/events";
import type { EventDeliveryResult, EventRouter } from "@relkit/providers-local";
import type { TestEventCloseOptions } from "./events-types.js";
import type { TestStateRoot } from "./state-root.js";
import type { TestFailureControls } from "./fakes.js";

/** Native authorities and Effect workflows owned by one event service Layer. */
export interface TestEventControlState {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly router: () => EventRouter;
  readonly log: () => { readonly close: () => Promise<void> };
  readonly open: Effect.Effect<void, unknown>;
  readonly release: Effect.Effect<void, unknown>;
  readonly work: WorkOwnershipState;
  readonly openFanout: (envelope: UnknownEventEnvelope) => Effect.Effect<void, unknown>;
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
  readonly publish: (
    ...args: Parameters<EventProvider["publish"]>
  ) => Effect.Effect<Awaited<ReturnType<EventProvider["publish"]>>, unknown>;
}

/** Native Promise facade preserving publication, inspection and delivery signatures. */
export interface TestEventControls {
  readonly publishNative: EventProvider["publish"];
  readonly pending: (triggerId?: string) => number;
  readonly runNext: (triggerId?: string) => Promise<EventDeliveryResult | undefined>;
  readonly drain: () => Promise<readonly EventDeliveryResult[]>;
  readonly completed: (triggerId?: string) => number;
  readonly restart: () => Promise<void>;
  readonly close: (options?: TestEventCloseOptions) => Promise<void>;
}
