import type { ControlClaim } from "@relkit/agents";
import { LocalAgentStateError, ownedThread } from "./common.js";
import { replaceThread } from "./run-state.js";

/**
 * Resolves a persisted control or raises the established not-found error.
 * @param local - Thread state owned by the current transaction.
 * @param operationId - Caller operation identity.
 * @returns The requested control after existence checks.
 */
export function requireControl(local: ReturnType<typeof ownedThread>, operationId: string) {
  const item = local.controls[operationId];
  if (item === undefined) throw new LocalAgentStateError("NOT_FOUND", "Control was not found.");
  return item;
}

/**
 * Replaces one control while preserving the thread and state revision rules.
 * @param state - Persisted domain snapshot.
 * @param scope - Application, environment and caller scope.
 * @param threadId - Thread identity within the scope.
 * @param operationId - Caller operation identity.
 * @param item - Candidate record or collection item.
 * @param claim - Caller ownership claim.
 * @returns The state containing the replacement control and updated revisions.
 */
export function withControl(
  state: Parameters<typeof replaceThread>[0],
  scope: Parameters<typeof ownedThread>[1],
  threadId: string,
  operationId: string,
  item: ReturnType<typeof requireControl>,
  claim?: ControlClaim,
) {
  const local = ownedThread(state, scope, threadId);
  return replaceThread(state, threadId, {
    ...local,
    nextFence: claim?.fence ?? local.nextFence,
    controls: { ...local.controls, [operationId]: item },
    controlClaims:
      claim === undefined ? local.controlClaims : { ...local.controlClaims, [operationId]: claim },
  });
}
