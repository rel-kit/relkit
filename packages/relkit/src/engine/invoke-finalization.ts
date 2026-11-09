import { Effect } from "effect";
import { enginePromise } from "./engine-runtime.js";
import { completeInvocation } from "./invoke-completion.js";
import type { InvocationFinalization } from "./invoke-finalization.types.js";
import { releaseSuspendedInvocation } from "./invoke-suspension.js";

/** Settle native ownership under the invocation's uninterruptible finalizer.
 * @typeParam Input - Declared handler input.
 * @typeParam Output - Declared handler output.
 * @typeParam Context - Public handler context carrying cancellation authority.
 * @param args - Invocation resources and completion/transfer state.
 * @returns A lazy finalizer; cleanup failures remain defects at the Effect boundary.
 * @remarks Suspension releases capacity without completion hooks. Deferred streams
 * retain every resource until their consumer-owned settlement path runs.
 */
export const settleInvocation = Effect.fn("Engine.invocation.settle")(
  <Input, Output, Context extends { readonly signal: AbortSignal }>(
    args: InvocationFinalization<Input, Output, Context>,
  ) =>
    Effect.gen(function* () {
      if (args.deferredCompletion) return;
      args.progress?.settle();
      if (args.suspended) {
        yield* enginePromise(() => releaseSuspendedInvocation(args));
      } else {
        args.execution.complete(args.outcome, args.error);
        yield* enginePromise(() => completeInvocation(args));
      }
    }).pipe(Effect.orDie),
);
