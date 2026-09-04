import type { HttpTriggerRegistration } from "@relkit/graph";
import type { HttpRequestState } from "./middleware.js";

export function recordRateLimitResult(
  trigger: HttpTriggerRegistration,
  state: HttpRequestState | undefined,
  startedAt: number,
  status: number,
  blocked: boolean,
  continued: boolean,
): void {
  const builder = state?.requestRecord;
  builder?.setRoute(trigger.id, trigger.targetFunctionId);
  builder?.setServiceId(trigger.serviceId);
  if (blocked && !continued) builder?.add({ kind: "match", at: startedAt, targetId: trigger.id });
  builder?.add({
    kind: "middleware",
    at: startedAt,
    durationMs: Math.max(0, Date.now() - startedAt),
    targetId: "relkit.rate-limit",
    status,
    outcome: blocked ? "declared-error" : "success",
  });
  if (blocked) builder?.setOutcome("declared-error", "rate-limit");
}
