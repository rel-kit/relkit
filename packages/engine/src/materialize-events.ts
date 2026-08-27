import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import type {
  EventNode,
  EventTriggerConfig,
  EventTriggerRegistration,
  RegistrationPlan,
} from "@relkit/graph";
import type { InvocationParent, InvokeOptions } from "./invoke-types.js";
import type { ProviderRegistry } from "./provider-registry-types.js";

export interface EventRuntimeProvider {
  readonly registerContract: (contract: EventNode) => MaybePromise<void>;
  readonly registerTrigger: (binding: EventTriggerBinding) => MaybePromise<void>;
}

export interface EventTriggerBinding {
  readonly id: string;
  readonly source: EventTriggerRegistration["source"];
  readonly targetFunctionId: string;
  readonly selector: JsonValue;
  readonly expansion: EventTriggerConfig["expansion"];
  readonly delivery: EventTriggerConfig["delivery"];
  readonly profile: string;
  readonly retry?: JsonValue;
  readonly concurrency?: number;
  readonly invoke: (
    envelope: UnknownEventEnvelope,
    options?: EventInvocationContext,
  ) => Promise<unknown>;
}

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
> & {
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
};

export type EventInvocationOptions = EventInvocationContext & {
  readonly functionId: string;
  readonly input: UnknownEventEnvelope;
  readonly source: "event";
  readonly parent?: InvocationParent;
  readonly correlationId?: string;
  readonly traceId: string;
};

export interface EventEngine {
  readonly invoke: (options: EventInvocationOptions) => Promise<unknown>;
}

export type EventProviderSource =
  ReadonlyMap<string, EventRuntimeProvider> | Readonly<Record<string, EventRuntimeProvider>>;

export interface EventMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly engine: EventEngine;
  readonly providerRegistry?: Pick<ProviderRegistry, "resolve">;
  readonly eventProviders?: EventProviderSource;
}

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

export class EventMaterializationError extends TypeError {
  readonly code = "RELKIT_EVENT_MATERIALIZATION_INVALID" as const;
}

export async function materializeEvents(
  options: EventMaterializationOptions,
): Promise<MaterializedEvents> {
  const functionIds = new Set(options.plan.functions.map(({ id }) => id));
  const triggers = new Map<string, EventTriggerBinding>();
  const providers = new Map<string, EventRuntimeProvider>();

  for (const registration of options.plan.eventTriggers) {
    if (triggers.has(registration.id))
      throw new EventMaterializationError(`Duplicate event trigger ${registration.id}.`);
    if (!functionIds.has(registration.targetFunctionId))
      throw new EventMaterializationError(
        `Event trigger ${registration.id} targets unknown function ${registration.targetFunctionId}.`,
      );
    const profile = registration.config.profile ?? "default";
    providers.set(profile, resolveProvider(profile, options));
    const expansion = Object.freeze([...registration.config.expansion]);
    triggers.set(
      registration.id,
      Object.freeze({
        id: registration.id,
        source: registration.source,
        targetFunctionId: registration.targetFunctionId,
        selector: registration.config.selector,
        expansion,
        delivery: registration.config.delivery,
        profile,
        ...(registration.config.retry === undefined ? {} : { retry: registration.config.retry }),
        ...(registration.config.concurrency === undefined
          ? {}
          : { concurrency: registration.config.concurrency }),
        invoke: (envelope: UnknownEventEnvelope, context: EventInvocationContext = {}) =>
          invokeListener(registration.targetFunctionId, envelope, context, options.engine),
      }),
    );
  }

  const contracts = new Map<string, EventNode>();
  for (const contract of options.plan.events ?? []) {
    const key = `${contract.id}@${contract.version}`;
    if (contracts.has(key)) throw new EventMaterializationError(`Duplicate event contract ${key}.`);
    contracts.set(key, contract);
  }
  for (const provider of providers.values())
    for (const contract of contracts.values()) await provider.registerContract(contract);
  for (const binding of triggers.values())
    await providers.get(binding.profile)!.registerTrigger(binding);

  return {
    contracts,
    triggers,
    providers,
    invoke: (triggerId, envelope, context = {}) => {
      const binding = triggers.get(triggerId);
      if (!binding) throw new EventMaterializationError(`Unknown event trigger ${triggerId}.`);
      return binding.invoke(envelope, context);
    },
  };
}

function resolveProvider(
  profile: string,
  options: EventMaterializationOptions,
): EventRuntimeProvider {
  const value = options.providerRegistry
    ? options.providerRegistry.resolve("events", profile).value
    : lookupProvider(options.eventProviders, profile);
  if (!isEventRuntimeProvider(value))
    throw new EventMaterializationError(`Event provider ${profile} is not registerable.`);
  return value;
}

function lookupProvider(source: EventProviderSource | undefined, profile: string): unknown {
  if (!source) throw new EventMaterializationError(`No event provider configured for ${profile}.`);
  return source instanceof Map ? source.get(profile) : Reflect.get(source, profile);
}

function isEventRuntimeProvider(value: unknown): value is EventRuntimeProvider {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as EventRuntimeProvider).registerContract === "function" &&
    typeof (value as EventRuntimeProvider).registerTrigger === "function"
  );
}

function invokeListener(
  functionId: string,
  envelope: UnknownEventEnvelope,
  context: EventInvocationContext,
  engine: EventEngine,
): Promise<unknown> {
  const parent: InvocationParent | undefined = envelope.causationInvocationId
    ? {
        id: envelope.causationInvocationId,
        traceId: envelope.traceId,
        ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }
    : undefined;
  return engine.invoke({
    ...context,
    functionId,
    input: envelope,
    source: "event",
    ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
    traceId: envelope.traceId,
    ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    ...(parent === undefined ? {} : { parent }),
  });
}
