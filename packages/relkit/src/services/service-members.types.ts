import type { Effect } from "effect";

/** Kinds accepted by service authoring.
 * @example const kind: ServiceMemberKind = "function";
 */
export type ServiceMemberKind = "function" | "event" | "task" | "job";

/** Predicate for one member category during Effect validation.
 * @param value - Untrusted member candidate.
 * @returns An Effect of its validity with no expected failure.
 * @example const valid: ServiceMemberValidator<number> = (value) => Effect.succeed(typeof value === "number");
 */
export type ServiceMemberValidator<T> = (value: unknown) => Effect.Effect<boolean>;
