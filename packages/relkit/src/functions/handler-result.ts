import type { ErrorDescriptorAny } from "./define-error.js";
import { Effect } from "effect";
import { functionTry, runFunctionSync } from "./function-observability.js";
import type { DeclaredErrorOf, FunctionFailure } from "./handler-result.types.js";

export type * from "./handler-result.types.js";

/** Creates a typed application failure in the Effect error channel.
 * @param descriptor - Declared error descriptor.
 * @param data - Input for that error.
 * @returns A frozen handler failure or a tagged validation failure.
 * @example Effect.runSync(failEffect(NotFound, { id: "one" }));
 */
export const failEffect = Effect.fn("functions.function.fail")(
  <const Descriptor extends ErrorDescriptorAny>(
    descriptor: Descriptor,
    data: Parameters<Descriptor["create"]>[0],
  ): Effect.Effect<
    FunctionFailure<DeclaredErrorOf<Descriptor>>,
    import("./function-observability.js").FunctionOperationError
  > =>
    functionTry("function.fail", () => {
      const error = descriptor.create(data) as DeclaredErrorOf<Descriptor>;
      return Object.freeze({ _tag: "FunctionFailure" as const, error });
    }),
);

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
  return runFunctionSync(failEffect(descriptor, data));
}
