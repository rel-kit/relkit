import { Effect } from "effect";
import { ServiceValidationError } from "./service-error.js";
import { observeService, runServiceSync } from "./service-observability.js";

/** Names disallowed as service members because they collide with descriptor metadata. */
export const SERVICE_RESERVED_MEMBER_NAMES = Object.freeze([
  "kind",
  "id",
  "ref",
  "functions",
  "events",
  "tasks",
  "jobs",
  "capability",
  "title",
  "description",
  "tags",
  "handler",
  "constructor",
  "prototype",
  "__proto__",
] as const);

/** Compatibility alias for the reserved member list. */
export const RESERVED_SERVICE_MEMBER_NAMES = SERVICE_RESERVED_MEMBER_NAMES;

/** Normalize a service member name inside Effect.
 * @param value - Candidate member name.
 * @returns The trimmed NFC name or ServiceValidationError.
 * @example Effect.runSync(normalizeServiceMemberNameEffect("lookup"));
 */
export const normalizeServiceMemberNameEffect = Effect.fn("Services.normalizeMemberName")(
  (value: unknown) =>
    observeService(
      "member.normalize",
      Effect.gen(function* () {
        if (typeof value !== "string")
          return yield* new ServiceValidationError({
            message: "Service member names must be strings",
          });
        const name = value.normalize("NFC").trim();
        if (name === "")
          return yield* new ServiceValidationError({
            message: "Service member names must be non-empty",
          });
        return name;
      }),
    ),
);

/** Normalize a service member name synchronously.
 * @param value - Candidate member name.
 * @returns Its trimmed NFC form.
 * @throws TypeError for non-string or empty input.
 * @example normalizeServiceMemberName(" lookup ");
 */
export function normalizeServiceMemberName(value: unknown): string {
  return runServiceSync(normalizeServiceMemberNameEffect(value));
}

/** Check whether a candidate is a reserved member name in Effect.
 * @param value - Candidate name.
 * @returns An Effect of a boolean with no expected failure.
 * @example Effect.runSync(isReservedServiceMemberNameEffect("id"));
 */
export const isReservedServiceMemberNameEffect = Effect.fn("Services.isReservedMemberName")(
  (value: unknown) =>
    observeService(
      "member.is-reserved",
      Effect.sync(
        () =>
          typeof value === "string" &&
          SERVICE_RESERVED_MEMBER_NAMES.some(
            (reserved) => reserved === value.normalize("NFC").trim(),
          ),
      ),
    ),
);

/** Check a candidate against the reserved member list.
 * @param value - Candidate name.
 * @returns True when the normalized name is reserved.
 * @example isReservedServiceMemberName(" id ");
 */
export function isReservedServiceMemberName(value: unknown): boolean {
  return runServiceSync(isReservedServiceMemberNameEffect(value));
}

/** Validate one member name with a tagged Effect failure.
 * @param value - Candidate name.
 * @returns The valid name or ServiceValidationError.
 * @example Effect.runSync(assertServiceMemberNameEffect("lookup"));
 */
export const assertServiceMemberNameEffect = Effect.fn("Services.assertMemberName")(
  (value: unknown) =>
    observeService(
      "member.assert",
      Effect.gen(function* () {
        const name = yield* normalizeServiceMemberNameEffect(value);
        if (name !== value)
          return yield* new ServiceValidationError({
            message: `Service member name "${String(value)}" is not normalized`,
          });
        if (yield* isReservedServiceMemberNameEffect(name))
          return yield* new ServiceValidationError({
            message: `Service member name "${name}" is reserved`,
          });
        return name;
      }),
    ),
);

/** Assert a canonical, nonreserved member name synchronously.
 * @param value - Candidate name.
 * @returns Nothing when the name is valid.
 * @throws TypeError for invalid names.
 * @example assertServiceMemberName("lookup");
 */
export function assertServiceMemberName(value: unknown): asserts value is string {
  runServiceSync(assertServiceMemberNameEffect(value));
}
