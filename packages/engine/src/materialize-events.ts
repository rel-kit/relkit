import type { UnknownEventEnvelope } from "@relkit/events";
import type { EventNode } from "@relkit/graph";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { enginePromise, engineTry, runEnginePromise } from "./engine-runtime.js";
import { invokeEventFunction } from "./event-invocation.js";
import type {
  EventInvocationContext,
  EventMaterializationOptions,
  EventProviderSource,
  EventRuntimeProvider,
  EventTriggerBinding,
  MaterializedEvents,
} from "./materialize-events.types.js";
export type {
  EventEngine,
  EventInvocationContext,
  EventInvocationOptions,
  EventMaterializationOptions,
  EventProviderSource,
  EventRuntimeProvider,
  EventTriggerBinding,
  MaterializedEvents,
} from "./materialize-events.types.js";

/** Compatibility failure for invalid event registration or delivery metadata. */
export class EventMaterializationError extends TypeError {
  readonly code = "RELKIT_EVENT_MATERIALIZATION_INVALID" as const;
}

/** Register verified event contracts and delivery triggers through explicit providers.
 * @param options - Explicit generation dependencies and operation configuration.
 * @returns A lazy Effect yielding registered contracts/providers/triggers; invalid plans fail with EventMaterializationError.
 */
export const materializeEventsEffect = Effect.fn("Engine.materializeEvents")(
  function* (options: EventMaterializationOptions) {
    const functions = new Map(options.plan.functions.map((node) => [node.id, node]));
    const triggers = new Map<string, EventTriggerBinding>();
    const providers = new Map<string, EventRuntimeProvider>();

    for (const registration of options.plan.eventTriggers) {
      if (triggers.has(registration.id))
        return yield* Effect.fail(
          new EventMaterializationError(`Duplicate event trigger ${registration.id}.`),
        );
      if (!functions.has(registration.targetFunctionId))
        return yield* Effect.fail(
          new EventMaterializationError(
            `Event trigger ${registration.id} targets unknown function ${registration.targetFunctionId}.`,
          ),
        );
      if (functions.get(registration.targetFunctionId)?.invocationMode !== "event-only") {
        return yield* Effect.fail(
          new EventMaterializationError(
            `Event trigger ${registration.id} must target an event-only function.`,
          ),
        );
      }
      const profile = registration.config.profile ?? "default";
      triggers.set(
        registration.id,
        Object.freeze({
          id: registration.id,
          source: registration.source,
          targetFunctionId: registration.targetFunctionId,
          eventId: registration.config.eventId,
          eventVersion: registration.config.eventVersion,
          delivery: registration.config.delivery,
          profile,
          ...(registration.config.retry === undefined ? {} : { retry: registration.config.retry }),
          ...(registration.config.concurrency === undefined
            ? {}
            : { concurrency: registration.config.concurrency }),
          ...(registration.config.timeoutMs === undefined
            ? {}
            : { timeoutMs: registration.config.timeoutMs }),
          invoke: (envelope: UnknownEventEnvelope, context: EventInvocationContext = {}) => {
            if (
              envelope.eventId !== registration.config.eventId ||
              envelope.version !== registration.config.eventVersion
            ) {
              throw new EventMaterializationError(
                `Event trigger ${registration.id} received the wrong event contract.`,
              );
            }
            return invokeEventFunction(
              registration.targetFunctionId,
              envelope,
              context,
              options.engine,
            );
          },
        }),
      );
    }

    const contracts = new Map<string, EventNode>();
    for (const contract of options.plan.events ?? []) {
      const key = `${contract.id}@${contract.version}`;
      if (contracts.has(key))
        return yield* Effect.fail(
          new EventMaterializationError(`Duplicate event contract ${key}.`),
        );
      contracts.set(key, contract);
    }
    const profiles = new Set([
      ...[...contracts.values()].map((contract) => contract.profile),
      ...[...triggers.values()].map((trigger) => trigger.profile),
    ]);
    yield* Effect.forEach(
      [...profiles].sort(),
      (profile) =>
        engineTry(() => {
          providers.set(profile, resolveProvider(profile, options));
        }),
      { discard: true },
    );
    yield* Effect.forEach(
      contracts.values(),
      (contract) =>
        enginePromise(() =>
          Promise.resolve(providers.get(contract.profile)!.registerContract(contract)),
        ),
      { discard: true },
    );
    yield* Effect.forEach(
      triggers.values(),
      (binding) =>
        enginePromise(() =>
          Promise.resolve(providers.get(binding.profile)!.registerTrigger(binding)),
        ),
      { discard: true },
    );

    return {
      contracts,
      triggers,
      providers,
      invoke: (
        triggerId: string,
        envelope: UnknownEventEnvelope,
        context: EventInvocationContext = {},
      ) => {
        const binding = triggers.get(triggerId);
        if (!binding) throw new EventMaterializationError(`Unknown event trigger ${triggerId}.`);
        return binding.invoke(envelope, context);
      },
    };
  },
  (effect, options) =>
    observeExecution("engine", "materializeEvents", effect, () => ({
      contracts: options.plan.events?.length ?? 0,
      triggers: options.plan.eventTriggers.length,
    })),
);

/** Register verified event contracts and delivery triggers through explicit providers.
 * @returns A Promise of registered contracts, providers and trigger dispatch.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export async function materializeEvents(
  options: EventMaterializationOptions,
): Promise<MaterializedEvents> {
  return runEnginePromise(materializeEventsEffect(options));
}

/** Resolve one explicit event profile and validate its registration methods.
 * @returns A provider exposing both event registration methods.
 * @param profile - Declared provider profile to resolve.
 * @param options - Explicit configuration and dependencies for this operation.
 */
function resolveProvider(
  profile: string,
  options: EventMaterializationOptions,
): EventRuntimeProvider {
  const value = options.providerRegistry
    ? options.providerRegistry.resolve("event", profile).value
    : lookupProvider(options.eventProviders, profile);
  if (!isEventRuntimeProvider(value))
    throw new EventMaterializationError(`Event provider ${profile} is not registerable.`);
  return value;
}

/** Read a native event provider from a map or record.
 * @returns The configured native event provider value.
 * @param source - Explicit native source or source collection.
 * @param profile - Declared provider profile to resolve.
 */
function lookupProvider(source: EventProviderSource | undefined, profile: string): unknown {
  if (!source) throw new EventMaterializationError(`No event provider configured for ${profile}.`);
  return source instanceof Map ? source.get(profile) : Reflect.get(source, profile);
}

/** Recognize the two required event registration methods.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isEventRuntimeProvider(value: unknown): value is EventRuntimeProvider {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as EventRuntimeProvider).registerContract === "function" &&
    typeof (value as EventRuntimeProvider).registerTrigger === "function"
  );
}
