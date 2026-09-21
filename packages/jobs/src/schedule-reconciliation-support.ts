import type { OperationContext } from "./adapter.js";
import type { NativeOwnedScheduleRecord } from "./schedule-reconciliation.js";

export async function writeWithRecovery(
  write: () => Promise<unknown>,
  context: OperationContext,
): Promise<unknown> {
  let lastUnknown = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await write();
      if (isUnsupported(result))
        throw new Error("RELKIT_SCHEDULE_UNSUPPORTED:" + (context.operationId ?? "operation"));
      if (!isUnknown(result)) return result;
      lastUnknown = true;
    } catch (error) {
      if (!isAmbiguous(error)) throw error;
      lastUnknown = true;
    }
  }
  if (lastUnknown)
    throw new Error("RELKIT_SCHEDULE_WRITE_UNKNOWN:" + (context.operationId ?? "operation"));
  throw new Error("RELKIT_SCHEDULE_WRITE_FAILED");
}

export function writeContext(
  context: OperationContext,
  operationIdValue: string,
): OperationContext {
  return Object.freeze({ ...context, operationId: operationIdValue });
}

export function isScheduleRecord(value: unknown): value is NativeOwnedScheduleRecord {
  return isRecord(value) && typeof value.id === "string";
}

function isUnknown(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unknown";
}

function isUnsupported(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unsupported";
}

function isAmbiguous(value: unknown): boolean {
  return !(value instanceof Error && /^4\d\d/u.test(value.message));
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
