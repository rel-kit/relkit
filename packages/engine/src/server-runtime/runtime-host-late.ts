/** Retains cleanup evidence after cancelled native acquisition, including disposal races. */
import { runExecutionPromise } from "@relkit/contracts/operation";
import type { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";

/** @param owner - Original generation owner. @param failure - Late release evidence. @returns After best-effort publication; the sink never replaces cancellation. */
export async function reportLateHostFailure(
  owner: RuntimeHostState,
  failure: ServerRuntimeFailure,
): Promise<void> {
  if (owner.closedSnapshot === undefined) {
    try {
      await runExecutionPromise(owner.runtime, owner.service.failure(failure, true));
      return;
    } catch {
      /* Disposal can race a late native completion. */
    }
  }
  if (owner.closedSnapshot !== undefined)
    owner.closedSnapshot = {
      ...owner.closedSnapshot,
      cleanupFailures:
        owner.closedSnapshot.cleanupFailures.length < 32
          ? [...owner.closedSnapshot.cleanupFailures, failure]
          : [
              ...owner.closedSnapshot.cleanupFailures.slice(0, 1),
              ...owner.closedSnapshot.cleanupFailures.slice(-30),
              failure,
            ],
    };
  try {
    owner.options.report(failure, true);
  } catch {
    /* An observational sink never owns the primary result. */
  }
}
