import { Context, Scope } from "effect";
import { ownedLifecycle } from "./work-ownership.js";
import { Effect } from "effect";
import type { TestEventControlState } from "./events-runtime-controls.types.js";

/**
 * Composes restart and final release under the event service's scoped ownership.
 * @param state Native resources and owner-local admission/abort authority.
 * @param scope Acquired service scope retaining restart completion.
 * @param context Acquired observation context reused by native receipts.
 * @returns Effect controls joining actual work before release and reacquisition.
 */
export function eventLifecycle(
  state: TestEventControlState,
  scope: Scope.Scope,
  context: Context.Context<never>,
) {
  return ownedLifecycle(
    state.work,
    scope,
    context,
    state.release,
    state.open,
    (failed) => Effect.sync(() => state.owner.cleanup(failed)),
    "event.close",
  );
}
