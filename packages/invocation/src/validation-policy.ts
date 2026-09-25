import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { InvocationSource, InvocationTarget } from "./validation-policy.types.js";

/** Tagged source or invocation mode validation failure.
 * @example Effect.catchTag(assertSourceEffect("unknown"), "InvocationPolicyFailure", () => Effect.void);
 */
export class InvocationPolicyFailure extends Data.TaggedError("InvocationPolicyFailure")<{
  readonly message: string;
}> {}

/** Checks an invocation source in the Effect error channel.
 * @param value - Source to check.
 * @returns Void or `InvocationPolicyFailure`.
 * @example Effect.runSync(assertSourceEffect("direct"));
 */
export function assertSourceEffect(value: string): Effect.Effect<void, InvocationPolicyFailure> {
  return observeInvocation(
    "validation.source",
    Effect.gen(function* () {
      if (
        !("direct http job event-delivery event-replay tool agent" as string)
          .split(" ")
          .includes(value)
      )
        return yield* Effect.fail(
          new InvocationPolicyFailure({ message: `Unknown invocation source: ${value}` }),
        );
    }),
  );
}

/** Synchronous source assertion compatibility adapter.
 * @param value - Source to check.
 * @returns Void when valid.
 * @throws TypeError when the source is unknown.
 * @example assertSource("direct");
 */
export function assertSource(value: string): asserts value is InvocationSource {
  try {
    runInvocationSync(assertSourceEffect(value));
  } catch (cause) {
    if (cause instanceof InvocationPolicyFailure) throw new TypeError(cause.message);
    throw cause;
  }
}

/** Checks target invocation mode against its source.
 * @param target - Target identity and mode.
 * @param source - Valid invocation source.
 * @returns Void or `InvocationPolicyFailure`.
 * @example Effect.runSync(assertInvocationModeEffect(target, "direct"));
 */
export function assertInvocationModeEffect(
  target: Pick<InvocationTarget, "id" | "invocationMode">,
  source: InvocationSource,
): Effect.Effect<void, InvocationPolicyFailure> {
  return observeInvocation(
    "validation.mode",
    Effect.gen(function* () {
      const eventSource = source === "event-delivery" || source === "event-replay";
      if (target.invocationMode === "event-only" && !eventSource)
        return yield* Effect.fail(
          new InvocationPolicyFailure({
            message: `Event-only function "${target.id}" cannot be invoked from ${source}`,
          }),
        );
      if (target.invocationMode !== "event-only" && eventSource)
        return yield* Effect.fail(
          new InvocationPolicyFailure({
            message: `Event delivery cannot target callable function "${target.id}"`,
          }),
        );
    }),
  );
}

/** Synchronous invocation mode assertion compatibility adapter.
 * @param target - Target identity and mode.
 * @param source - Valid invocation source.
 * @returns Void when allowed.
 * @throws TypeError when source and mode are incompatible.
 * @example assertInvocationMode(target, "direct");
 */
export function assertInvocationMode(
  target: Pick<InvocationTarget, "id" | "invocationMode">,
  source: InvocationSource,
): void {
  try {
    runInvocationSync(assertInvocationModeEffect(target, source));
  } catch (cause) {
    if (cause instanceof InvocationPolicyFailure) throw new TypeError(cause.message);
    throw cause;
  }
}
