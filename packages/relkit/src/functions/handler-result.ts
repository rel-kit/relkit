import type { ErrorDescriptorAny } from "./define-error.js";
import { Effect } from "effect";
import { functionTry, runFunctionSync } from "./function-observability.js";
import type { DeclaredErrorOf, FunctionFailure } from "./handler-result.types.js";

export type * from "./handler-result.types.js";

/** Fails an Effect with a declared error, for handlers written with Effect.
 * Invalid error data is a defect, as when `fail` throws inside a Promise handler.
 * @param descriptor - Declared error descriptor.
 * @param data - Input for that error.
 * @returns An Effect that fails with the declared error.
 * @example if (!order) return yield* failEffect(NotFound, { id: "one" });
 */
export function failEffect<const Descriptor extends ErrorDescriptorAny>(
  descriptor: Descriptor,
  data: Parameters<Descriptor["create"]>[0],
): Effect.Effect<never, DeclaredErrorOf<Descriptor>> {
  // Untraced, so the handler's trace shows the failure and not RelKit's construction of it.
  return Effect.sync(() => descriptor.create(data) as DeclaredErrorOf<Descriptor>).pipe(
    Effect.flatMap(Effect.fail),
  );
}

/** Returns a typed application failure from a plain function handler.
 * @param descriptor - Declared error descriptor.
 * @param data - Input for that error.
 * @returns Frozen handler failure.
 * @throws The descriptor's validation error.
 * @example return fail(NotFound, { id: "one" });
 */
export function fail<const Descriptor extends ErrorDescriptorAny>(
  descriptor: Descriptor,
  data: Parameters<Descriptor["create"]>[0],
): FunctionFailure<DeclaredErrorOf<Descriptor>> {
  return runFunctionSync(
    functionTry("function.fail", () => {
      const error = descriptor.create(data) as DeclaredErrorOf<Descriptor>;
      return Object.freeze({ _tag: "FunctionFailure" as const, error });
    }),
  );
}
