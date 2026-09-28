import { isDescriptorEffect } from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import { Effect } from "effect";
import { observeService, runServiceSync } from "./service-observability.js";

/** Check a function member's descriptor contract in Effect.
 * @param value - Candidate member.
 * @returns An Effect of a boolean with no expected failure.
 * @example Effect.runSync(isFunctionDescriptorEffect(candidate));
 */
export const isFunctionDescriptorEffect = Effect.fn("Services.isFunctionDescriptor")(
  (value: unknown) =>
    observeService(
      "function.is",
      Effect.gen(function* () {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
        if (!(yield* isDescriptorEffect(value, "function"))) return false;
        const record = value as Record<PropertyKey, unknown>;
        return (
          record.invocationMode !== "event-only" &&
          (yield* isSchemaEffect(record.input)) &&
          (yield* isSchemaEffect(record.output)) &&
          typeof record.handler === "function"
        );
      }),
    ),
);

/** Check a function member synchronously.
 * @param value - Candidate member.
 * @returns True for a callable function descriptor.
 * @example isFunctionDescriptor(candidate);
 */
export function isFunctionDescriptor(value: unknown): value is FunctionRefAny {
  return runServiceSync(isFunctionDescriptorEffect(value));
}

/** Recognize Standard Schema v1 within the parent function guard span. */
function isSchemaEffect(value: unknown): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const standard = Reflect.get(value, "~standard");
    return (
      standard !== null &&
      typeof standard === "object" &&
      Reflect.get(standard, "version") === 1 &&
      typeof Reflect.get(standard, "validate") === "function"
    );
  });
}
