import { Effect } from "effect";
import { assertServiceMemberNameEffect } from "./member-name.js";
import { ServiceValidationError } from "./service-error.js";
import type { ServiceMemberKind, ServiceMemberValidator } from "./service-members.types.js";
import { observeService } from "./service-observability.js";

/** Copy and validate one category of service members in insertion order.
 * @param value - Optional member map.
 * @param validate - Descriptor predicate for the category.
 * @param kind - Fixed category name for errors.
 * @returns A copied map or ServiceValidationError.
 * @example Effect.runSync(copyServiceMembersEffect({ lookup }, isFunctionDescriptorEffect, "function"));
 */
export const copyServiceMembersEffect = Effect.fn("Services.copyMembers")(
  <T>(
    value: Readonly<Record<string, T>> | undefined,
    validate: ServiceMemberValidator<T>,
    kind: ServiceMemberKind,
  ) =>
    observeService(
      "members.copy",
      Effect.gen(function* () {
        if (value === undefined) return {} as Readonly<Record<string, T>>;
        if (value === null || typeof value !== "object" || Array.isArray(value))
          return yield* new ServiceValidationError({
            message: `Service ${kind}s must be an object`,
          });
        const members: Record<string, T> = {};
        for (const [name, member] of Object.entries(value)) {
          yield* assertServiceMemberNameEffect(name);
          if (!(yield* validate(member)))
            return yield* new ServiceValidationError({
              message: `Invalid service ${kind} member "${name}"`,
            });
          members[name] = member;
        }
        return members;
      }),
    ),
);

/** Reject member names appearing in more than one category.
 * @param maps - Validated member maps in category order.
 * @returns Void or ServiceValidationError on the first duplicate.
 * @example Effect.runSync(assertUniqueServiceMembersEffect({ lookup }, {}));
 */
export const assertUniqueServiceMembersEffect = Effect.fn("Services.uniqueMembers")(
  (...maps: readonly Readonly<Record<string, unknown>>[]) =>
    observeService(
      "members.unique",
      Effect.gen(function* () {
        const names = new Set<string>();
        for (const members of maps)
          for (const name of Object.keys(members)) {
            if (names.has(name))
              return yield* new ServiceValidationError({
                message: `Duplicate service member "${name}"`,
              });
            names.add(name);
          }
      }),
    ),
);
