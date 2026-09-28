import { deepFreezeEffect, isDescriptorEffect } from "@relkit/contracts";
import { isJobDescriptorEffect, isTaskDescriptorEffect } from "@relkit/jobs";
import { Effect } from "effect";
import type { ServiceDescriptorAny } from "./define-service.types.js";
import { isFunctionDescriptorEffect } from "./function-guards.js";
import { isReservedServiceMemberNameEffect } from "./member-name.js";
import { ServiceValidationError } from "./service-error.js";
import { observeService, runServiceSync } from "./service-observability.js";

/** Check a service descriptor and every public member in Effect.
 * @param value - Candidate descriptor.
 * @returns An Effect of a boolean with no expected failure.
 * @example Effect.runSync(isServiceDescriptorEffect(candidate));
 */
export const isServiceDescriptorEffect = Effect.fn("Services.isDescriptor")((value: unknown) =>
  observeService(
    "descriptor.is",
    Effect.gen(function* () {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      if (!(yield* isDescriptorEffect(value, "service"))) return false;
      if (Object.prototype.hasOwnProperty.call(value, "handler")) return false;
      for (const [name, member] of Object.entries(value)) {
        if (yield* isReservedServiceMemberNameEffect(name)) continue;
        if (yield* isFunctionDescriptorEffect(member)) continue;
        if (yield* isEventMemberEffect(member)) continue;
        if (yield* isTaskDescriptorEffect(member)) continue;
        if (yield* isJobDescriptorEffect(member)) continue;
        return false;
      }
      return true;
    }),
  ),
);

/** Check a service descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns True for a branded service with valid members.
 * @example isServiceDescriptor(candidate);
 */
export function isServiceDescriptor(value: unknown): value is ServiceDescriptorAny {
  return runServiceSync(isServiceDescriptorEffect(value));
}

/** Require a valid service descriptor in Effect.
 * @param value - Candidate descriptor.
 * @returns The descriptor or ServiceValidationError.
 * @example Effect.runSync(assertServiceDescriptorEffect(candidate));
 */
export const assertServiceDescriptorEffect = Effect.fn("Services.assertDescriptor")(
  (value: unknown) =>
    observeService(
      "descriptor.assert",
      Effect.gen(function* () {
        if (!(yield* isServiceDescriptorEffect(value)))
          return yield* new ServiceValidationError({ message: "Invalid service descriptor" });
        return value as ServiceDescriptorAny;
      }),
    ),
);

/** Require a valid service descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns Nothing when valid.
 * @throws TypeError when invalid.
 * @example assertServiceDescriptor(candidate);
 */
export function assertServiceDescriptor(value: unknown): asserts value is ServiceDescriptorAny {
  runServiceSync(assertServiceDescriptorEffect(value));
}

/** Validate and recursively freeze a descriptor in Effect.
 * @param value - Candidate descriptor.
 * @returns The same frozen descriptor or ServiceValidationError.
 * @example Effect.runSync(freezeServiceDescriptorEffect(service));
 */
export const freezeServiceDescriptorEffect = Effect.fn("Services.freezeDescriptor")(
  <T extends ServiceDescriptorAny>(value: T) =>
    observeService(
      "descriptor.freeze",
      Effect.gen(function* () {
        yield* assertServiceDescriptorEffect(value);
        return yield* deepFreezeEffect(value);
      }),
    ),
);

/** Validate and freeze a descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns The same frozen descriptor.
 * @throws TypeError when the descriptor is invalid.
 * @example freezeServiceDescriptor(service);
 */
export function freezeServiceDescriptor<T extends ServiceDescriptorAny>(value: T): T {
  return runServiceSync(freezeServiceDescriptorEffect(value));
}

/** Enumerate public descriptor members in Effect.
 * @param service - Service descriptor.
 * @returns Its nonmetadata entries, with no expected failure.
 * @example Effect.runSync(serviceMemberEntriesEffect(service));
 */
export const serviceMemberEntriesEffect = Effect.fn("Services.memberEntries")(
  (service: ServiceDescriptorAny) =>
    observeService(
      "descriptor.entries",
      Effect.gen(function* () {
        const entries: [string, unknown][] = [];
        for (const [name, member] of Object.entries(service))
          if (!(yield* isReservedServiceMemberNameEffect(name))) entries.push([name, member]);
        return entries;
      }),
    ),
);

/** Enumerate public descriptor members synchronously.
 * @param service - Service descriptor.
 * @returns Its nonmetadata entries.
 * @example serviceMemberEntries(service);
 */
export function serviceMemberEntries(service: ServiceDescriptorAny): [string, unknown][] {
  return runServiceSync(serviceMemberEntriesEffect(service));
}

/** Event members only need a branded event descriptor at this boundary. */
function isEventMemberEffect(value: unknown) {
  return isDescriptorEffect(value, "event");
}
