import { isRecord } from "./shared.js";

/**
 * Selects the existing identity precedence from public runtime record fields.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A public runtime identifier or undefined.
 */
export function runtimeItemId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of [
    "id",
    "functionId",
    "jobId",
    "instanceId",
    "eventId",
    "deliveryId",
    "bucketId",
    "cacheId",
    "toolId",
    "agentId",
  ]) {
    if (typeof value[key] === "string" && value[key].length > 0) return value[key];
  }
  return undefined;
}
