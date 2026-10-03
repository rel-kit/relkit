import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import type {
  EventNode,
  EventTriggerConfig,
  EventTriggerRegistration,
  RegistrationPlan,
} from "@relkit/graph";
import type { InvokeOptions } from "./invoke-types.js";
import type { ProviderRegistry } from "./provider-registry-types.js";

/** Native provider callbacks used to register event contracts and triggers. */
export interface EventRuntimeProvider {
  readonly registerContract: (contract: EventNode) => MaybePromise<void>;
  readonly registerTrigger: (binding: EventTriggerBinding) => MaybePromise<void>;
}

/** Resolved event contract and target function with a delivery callback. */
export interface EventTriggerBinding {
  readonly id: string;
  readonly source: EventTriggerRegistration["source"];
  readonly targetFunctionId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: EventTriggerConfig["delivery"];
  readonly profile: string;
  readonly retry?: JsonValue;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly invoke: (
    envelope: UnknownEventEnvelope,
    options?: EventInvocationContext,
  ) => Promise<unknown>;
}

/** Delivery cancellation/deadline metadata inherited by event execution. */
export type EventInvocationContext = Omit<
  InvokeOptions<unknown, unknown>,
  | "target"
  | "registry"
  | "functionId"
  | "input"
  | "source"
  | "parent"
  | "correlationId"
  | "traceId"
  | "deadlineMs"
  | "signal"
  | "trigger"
> & {
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
  readonly replayed?: boolean;
};

/** Event-delivery invocation with persisted producer trace links. */
export type EventInvocationOptions = EventInvocationContext & {
  readonly functionId: string;
  readonly input: unknown;
  readonly source: "event-delivery" | "event-replay";
  readonly correlationId?: string;
  readonly originRequestId?: string;
  readonly links?: InvokeOptions<unknown, unknown>["links"];
  readonly trigger: unknown;
};

/** Native invocation boundary used by materialized event triggers. */
export interface EventEngine {
  readonly invoke: (options: EventInvocationOptions) => Promise<unknown>;
}

/** Explicit event-provider values keyed by profile. */
export type EventProviderSource =
  ReadonlyMap<string, EventRuntimeProvider> | Readonly<Record<string, EventRuntimeProvider>>;

/** Verified plan, invocation boundary and event-provider lookup. */
export interface EventMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly engine: EventEngine;
  readonly providerRegistry?: Pick<ProviderRegistry, "resolve">;
  readonly eventProviders?: EventProviderSource;
}

/** Registered contracts, trigger callbacks and resolved provider handles. */
export interface MaterializedEvents {
  readonly contracts: ReadonlyMap<string, EventNode>;
  readonly triggers: ReadonlyMap<string, EventTriggerBinding>;
  readonly providers: ReadonlyMap<string, EventRuntimeProvider>;
  readonly invoke: (
    triggerId: string,
    envelope: UnknownEventEnvelope,
    options?: EventInvocationContext,
  ) => Promise<unknown>;
}
