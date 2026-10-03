import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { enginePromise } from "./engine-runtime.js";
import type { InvocationSource, InvocationTarget, InvokeOptions } from "./invoke-types.js";

/** Acquire capacity only after input validation, retaining the caller's native admission seam.
 * @typeParam Input - Validated handler input.
 * @typeParam Output - Declared handler output.
 * @typeParam Context - Public handler context carrying cancellation authority.
 * @param options - Generation admission callback or admission owner.
 * @param target - Target identity and declared function concurrency.
 * @param source - Shared invocation source classification.
 * @param signal - Invocation-owned cancellation signal.
 * @param deadlineMs - Optional absolute invocation deadline.
 * @returns A lazy Effect of the admitted lease, or undefined for unbounded execution.
 * @remarks Queued admission holds no generation lease. The invocation releases the
 * returned lease after normal output, failure, suspension or stream settlement.
 */
export const acquireInvocationLease = Effect.fn("Engine.invocation.admit")(
  <Input, Output, Context extends { readonly signal: AbortSignal }>(
    options: InvokeOptions<Input, Output, Context>,
    target: InvocationTarget<Input, Output, Context>,
    source: InvocationSource,
    signal: AbortSignal,
    deadlineMs: number | undefined,
  ) =>
    observeExecution(
      "engine",
      "invocation.admit",
      enginePromise(() =>
        Promise.resolve(
          (options.admit ?? options.admission?.acquire ?? (() => undefined))({
            functionId: target.id,
            source,
            signal,
            ...(options.triggerLimit === undefined ? {} : { triggerLimit: options.triggerLimit }),
            ...(target.concurrency === undefined ? {} : { limit: target.concurrency }),
            ...(deadlineMs === undefined ? {} : { deadlineMs }),
          }),
        ),
      ),
    ),
);
