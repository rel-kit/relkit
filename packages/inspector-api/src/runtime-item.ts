import { isRecord } from "./shared.js";

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
