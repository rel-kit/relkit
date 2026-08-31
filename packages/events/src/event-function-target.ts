import { deepFreeze } from "@relkit/contracts";
import {
  bindDescriptorIdentity,
  getDescriptorIdentity,
  isDescriptorIdentityBound,
} from "@relkit/invocation";
import { assertEventDescriptor, type EventDescriptorAny } from "./define-event.js";
import { isEventFunctionDescriptor } from "./define-event-function.js";

interface FunctionWithEvents {
  readonly id: string;
  readonly invocationMode?: "callable" | "event-only";
  readonly event?: string;
  readonly publishes?: readonly string[];
  readonly input?: unknown;
}

/** @internal Used by generated manifests to bind registered event contracts. */
export function bindFunctionEvents<T extends FunctionWithEvents>(
  descriptor: T,
  consumed: EventDescriptorAny | undefined,
  published: readonly EventDescriptorAny[],
): T {
  if (consumed !== undefined) assertEventDescriptor(consumed);
  for (const event of published) assertEventDescriptor(event);
  if (descriptor.invocationMode === "event-only" && !isEventFunctionDescriptor(descriptor)) {
    throw new TypeError(`Invalid event function "${descriptor.id}"`);
  }
  if (
    descriptor.invocationMode === "event-only" &&
    (consumed === undefined || descriptor.event !== consumed.id)
  ) {
    throw new TypeError(`Event function "${descriptor.id}" has no matching event contract`);
  }
  const declarations = descriptor.publishes ?? [];
  if (
    declarations.length !== published.length ||
    declarations.some((eventId) => !published.some((event) => event.id === eventId))
  ) {
    throw new TypeError(`Function "${descriptor.id}" has incomplete publication contracts`);
  }
  const target = deepFreeze(
    Object.defineProperties(
      {},
      {
        ...Object.getOwnPropertyDescriptors(descriptor),
        ...(consumed === undefined ? {} : { input: { value: consumed.input, enumerable: true } }),
        publications: {
          value: Object.fromEntries(published.map((event) => [event.id, event])),
          enumerable: true,
        },
      },
    ),
  ) as T;
  if (isDescriptorIdentityBound(descriptor)) {
    bindDescriptorIdentity(target, getDescriptorIdentity(descriptor));
  }
  return target;
}
