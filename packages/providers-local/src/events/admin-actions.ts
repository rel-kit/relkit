import type {
  EventAdminAction,
  EventAdminActionRecord,
  EventAdminActionSink,
  EventAdminMode,
  EventDeliveryContract,
} from "./admin-contracts.js";
import { versioned } from "./admin-utils.js";

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
