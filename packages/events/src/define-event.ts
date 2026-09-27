import { createDescriptorBase, deepFreeze, isDescriptor, normalizeId } from "@relkit/contracts";
import { Effect } from "effect";
import type {
  DefineEventOptions,
  EventDescriptor,
  EventDescriptorAny,
  InferOutput,
  StandardSchemaV1,
} from "./define-event.types.js";
import {
  hasOwn,
  isPositiveInteger,
  isRecord,
  isSchema,
  validateVersion,
} from "./event-contract-shape.js";
import { EventDefinitionError } from "./event-errors.js";
import { observeEvent, runEventSync } from "./event-observability.js";

export type {
  DefineEventOptions,
  EventDescriptor,
  EventDescriptorAny,
  EventEnvelope,
  EventEnvelopeFor,
  UnknownEventEnvelope,
} from "./define-event.types.js";

/**
 * Defines a versioned event contract used by publishers and event functions.
 *
 * @example
 * ```ts
 * import { defineEvent } from "@relkit/app/events"
 * import { z } from "@relkit/app/schema"
 *
 * const created = defineEvent({ id: "orders.created", input: z.object({ orderId: z.string() }) })
 * void created
 * ```
 * @category Events
 * @since 0.1.0
 * @param options - Versioned contract input.
 * @returns A frozen descriptor.
 * @throws TypeError when the contract is malformed.
 */
export function defineEvent<
  const Id extends string,
  const Version extends number = 1,
  const InputSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: DefineEventOptions<Id, Version, InputSchema>,
): EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema> {
  try {
    return runEventSync(defineEventEffect(options));
  } catch (error) {
    if (error instanceof EventDefinitionError) throw new TypeError(error.message);
    throw error;
  }
}

/** Defines an event contract in Effect with typed validation failure.
 * @param options - Versioned contract input.
 * @returns An Effect succeeding with a frozen descriptor or failing with EventDefinitionError.
 * @example Effect.runSync(defineEventEffect({ id: "orders.created", input: z.object({}) }))
 */
export function defineEventEffect<
  const Id extends string,
  const Version extends number = 1,
  const InputSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: DefineEventOptions<Id, Version, InputSchema>,
): Effect.Effect<
  EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema>,
  EventDefinitionError
> {
  return observeEvent(
    "event.define",
    Effect.fn("Events.define")(() =>
      Effect.try({
        try: () => buildEvent(options),
        catch: (cause) =>
          new EventDefinitionError({
            message: cause instanceof Error ? cause.message : "Invalid event descriptor",
          }),
      }),
    )(),
  );
}

function buildEvent<
  Id extends string,
  Version extends number,
  InputSchema extends StandardSchemaV1,
>(
  options: DefineEventOptions<Id, Version, InputSchema>,
): EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema> {
  if (!isRecord(options)) throw new TypeError("Event options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Events cannot own handlers");
  if (hasOwn(options, "output")) throw new TypeError("Events cannot own outputs");
  if (!isSchema(options.input))
    throw new TypeError("Event input must be a Standard Schema v1 validator");
  const version = options.version ?? 1;
  validateVersion(version);
  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const sensitiveFields = copySensitiveFields(options.sensitiveFields);
  const base = createDescriptorBase("event", options.id, options);

  return deepFreeze({
    ...base,
    version,
    input: options.input,
    ...(profile === undefined ? {} : { profile }),
    ...(sensitiveFields === undefined ? {} : { sensitiveFields }),
  }) as EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema>;
}

/** Checks a candidate against the event descriptor contract.
 * @param value - Candidate descriptor.
 * @returns Whether the value is a valid event descriptor.
 * @example isEventDescriptor(value)
 */
export function isEventDescriptor(value: unknown): value is EventDescriptorAny {
  return runEventSync(isEventDescriptorEffect(value));
}

/** Checks whether an unknown value is a valid event descriptor.
 * @param value - Candidate value.
 * @returns An Effect succeeding with the type guard result; it has no expected failure.
 * @example Effect.runSync(isEventDescriptorEffect(candidate))
 */
export const isEventDescriptorEffect = Effect.fn("Events.isDescriptor")((value: unknown) =>
  observeEvent(
    "event.isDescriptor",
    Effect.sync(() => checkEventDescriptor(value)),
  ),
);

function checkEventDescriptor(value: unknown): value is EventDescriptorAny {
  if (!isDescriptor(value, "event") || !isRecord(value)) return false;
  return (
    isSchema(value.input) &&
    isPositiveInteger(value.version) &&
    (value.profile === undefined || isStableProfile(value.profile)) &&
    !hasOwn(value, "handler") &&
    !hasOwn(value, "output")
  );
}

function isStableProfile(value: unknown): value is string {
  try {
    normalizeId(value);
    return true;
  } catch {
    return false;
  }
}

/** Requires a valid event descriptor at a synchronous boundary.
 * @param value - Candidate descriptor.
 * @returns Void after validation.
 * @throws TypeError when the candidate is invalid.
 * @example assertEventDescriptor(value)
 */
export function assertEventDescriptor(value: unknown): asserts value is EventDescriptorAny {
  try {
    runEventSync(assertEventDescriptorEffect(value));
  } catch (error) {
    if (error instanceof EventDefinitionError) throw new TypeError(error.message);
    throw error;
  }
}

/** Requires a valid event descriptor in an Effect workflow.
 * @param value - Candidate value.
 * @returns An Effect succeeding with the descriptor or failing with EventDefinitionError.
 * @example Effect.runSync(assertEventDescriptorEffect(candidate))
 */
export const assertEventDescriptorEffect = Effect.fn("Events.assertDescriptor")((value: unknown) =>
  observeEvent(
    "event.assertDescriptor",
    Effect.gen(function* () {
      if (!checkEventDescriptor(value))
        return yield* new EventDefinitionError({ message: "Invalid event descriptor" });
      return value;
    }),
  ),
);

function copySensitiveFields(value: readonly string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Event sensitiveFields must be an array");
  const fields = value.map((field) => {
    if (typeof field !== "string" || field.trim() === "")
      throw new TypeError("Event sensitive fields must be non-empty strings");
    return field.trim();
  });
  if (new Set(fields).size !== fields.length)
    throw new TypeError("Event sensitive fields must be unique");
  return Object.freeze(fields);
}
