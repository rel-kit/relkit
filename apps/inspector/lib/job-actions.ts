import { INSPECTOR_API_BASE, type InspectorObject } from "./api-types";
import type { InspectorApiClient } from "./api";

export type JobAction = "retry" | "cancel";

export const JOB_ACTION_CAPABILITIES = Object.freeze({
  retry: `${INSPECTOR_API_BASE}/actions/jobs/:id/retry`,
  cancel: `${INSPECTOR_API_BASE}/actions/jobs/:id/cancel`,
});

export interface JobActionInput {
  readonly instanceId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly idempotencyKey: string;
  readonly reason?: string;
}

export async function jobActionCapabilities(
  client: Pick<InspectorApiClient, "request">,
): Promise<readonly string[]> {
  const payload = await client.request<InspectorObject>(INSPECTOR_API_BASE);
  return Array.isArray(payload.capabilities)
    ? payload.capabilities.filter((value): value is string => typeof value === "string")
    : [];
}

export function supportsJobAction(capabilities: readonly string[], action: JobAction): boolean {
  return capabilities.includes(JOB_ACTION_CAPABILITIES[action]);
}

export function invokeJobAction(
  client: Pick<InspectorApiClient, "request">,
  action: JobAction,
  input: JobActionInput,
): Promise<InspectorObject> {
  return client.request<InspectorObject>(
    `${INSPECTOR_API_BASE}/actions/jobs/${encodeURIComponent(input.instanceId)}/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
      cacheTags: ["jobs", "runtime"],
    },
  );
}
