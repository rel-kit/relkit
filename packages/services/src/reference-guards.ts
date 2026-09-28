import { isRefEffect } from "@relkit/contracts";
import { Effect } from "effect";
import type { ServiceRefAny } from "./reference-guards.types.js";
import { ServiceValidationError } from "./service-error.js";
import { observeService, runServiceSync } from "./service-observability.js";

/** Check a service reference in Effect.
 * @param value - Candidate reference wrapper.
 * @returns An Effect of a boolean with no expected failure.
 * @example Effect.runSync(isServiceRefEffect({ ref: createRef("service", "orders") }));
 */
export const isServiceRefEffect = Effect.fn("Services.isRef")((value: unknown) =>
  observeService(
    "ref.is",
    Effect.gen(function* () {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      return yield* isRefEffect(Reflect.get(value, "ref"), "service");
    }),
  ),
);

/** Check a service reference synchronously.
 * @param value - Candidate wrapper.
 * @returns True when it contains a service reference.
 * @example isServiceRef({ ref: createRef("service", "orders") });
 */
export function isServiceRef(value: unknown): value is ServiceRefAny {
  return runServiceSync(isServiceRefEffect(value));
}

/** Require a service reference in Effect.
 * @param value - Candidate wrapper.
 * @returns The validated wrapper or ServiceValidationError.
 * @example Effect.runSync(assertServiceRefEffect(candidate));
 */
export const assertServiceRefEffect = Effect.fn("Services.assertRef")((value: unknown) =>
  observeService(
    "ref.assert",
    Effect.gen(function* () {
      if (!(yield* isServiceRefEffect(value)))
        return yield* new ServiceValidationError({ message: "Invalid service reference" });
      return value as ServiceRefAny;
    }),
  ),
);

/** Require a service reference synchronously.
 * @param value - Candidate wrapper.
 * @returns Nothing when valid.
 * @throws TypeError when invalid.
 * @example assertServiceRef(candidate);
 */
export function assertServiceRef(value: unknown): asserts value is ServiceRefAny {
  runServiceSync(assertServiceRefEffect(value));
}
