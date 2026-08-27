import type { HttpTriggerRegistration } from "@relkit/graph";
import type { RequestOutcome, SpanRecord } from "@relkit/observability";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { HttpRequestState } from "./middleware.js";
import type { RateLimitInfo } from "hono-rate-limiter";

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

export function emitRateLimitSpan(
  options: RouteMaterializationOptions,
  trigger: HttpTriggerRegistration,
  state: HttpRequestState | undefined,
  spanId: string,
  startedAt: number,
  status: SpanRecord["status"],
  blocked: boolean,
  info?: RateLimitInfo,
  outcome?: RequestOutcome,
): void {
  if (state === undefined || options.observability === undefined) return;
  const policy = trigger.config.rateLimit!;
  const record: SpanRecord = {
    version: 1,
    signal: "span",
    requestId: state.requestId,
    traceId: state.traceId,
    generationId: options.generationId ?? "generation.runtime",
    graphHash: options.plan.graphHash,
    invocationId: `rate-limit:${state.requestId}`,
    spanId,
    name: "relkit.http.rate_limit",
    source: "http",
    status,
    startedAt: new Date(startedAt).toISOString(),
    ...(status === "completed"
      ? {
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: outcome ?? (blocked ? "declared-error" : "success"),
        }
      : {}),
    attributes: {
      "relkit.route.id": trigger.id,
      "relkit.rate_limit.limit": policy.limit,
      "relkit.rate_limit.remaining": info?.remaining ?? policy.limit,
      "relkit.rate_limit.blocked": blocked,
      "relkit.rate_limit.store": policy.storeId === undefined ? "memory" : "shared",
    },
  };
  try {
    options.observability.collect(record);
  } catch {
    // Telemetry is advisory and cannot change request behavior.
  }
}
