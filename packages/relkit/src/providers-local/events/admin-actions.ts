import type {
  EventAdminAction,
  EventAdminActionRecord,
  EventAdminActionSink,
  EventAdminMode,
  EventDeliveryContract,
} from "./admin-contracts.js";
import { versioned } from "./admin-utils.js";

/** Builds the immutable administration audit record with bounded identity and outcome fields.
 * @param action - Requested administration action.
 * @param actionId - Stable audit action identity.
 * @param deliveryId - Stable delivery identity.
 * @param requestedAt - Action request clock time in milliseconds.
 * @param outcome - Recorded operation outcome.
 * @param mode - Local administration environment mode.
 * @param before - State before the attempted transition.
 * @param after - State after the attempted transition.
 * @param errorCode - Safe public failure code.
 * @param reason - Optional bounded audit reason.
 * @returns The validated immutable durable or audit record.
 */
export function makeRecord(
  action: EventAdminAction,
  actionId: string,
  deliveryId: string,
  requestedAt: number,
  outcome: "applied" | "rejected",
  mode: EventAdminMode,
  before: EventDeliveryContract | undefined,
  after: EventDeliveryContract | undefined,
  errorCode?: string,
  reason?: string,
): EventAdminActionRecord {
  return versioned({
    actionId,
    action,
    deliveryId,
    ...(before?.eventInstanceId === undefined ? {} : { eventInstanceId: before.eventInstanceId }),
    ...(before?.triggerId === undefined ? {} : { triggerId: before.triggerId }),
    mode,
    outcome,
    requestedAt,
    ...(before === undefined ? {} : { fromState: before.state }),
    ...(after === undefined ? {} : { toState: after.state }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Stores the local audit record and isolates errors from its optional external sink.
 * @param options - Operation-specific policy, hooks and configuration.
 * @param record - Durable record or audit entry.
 * @returns The recorded audit entry, even if the optional sink fails.
 */
export async function recordAction(
  options: { readonly records: EventAdminActionRecord[]; readonly onAction?: EventAdminActionSink },
  record: EventAdminActionRecord,
): Promise<EventAdminActionRecord> {
  options.records.push(record);
  try {
    await options.onAction?.(record);
  } catch {
    // A failing sink cannot erase the local audit record or change its result.
  }
  return record;
}
