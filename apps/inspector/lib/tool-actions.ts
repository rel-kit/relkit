import { INSPECTOR_API_BASE, type InspectorObject } from "./api-types";
import type { InspectorApiClient } from "./api";

export type ToolApprovalAction = "approve" | "deny";

export const TOOL_APPROVAL_CAPABILITIES = Object.freeze({
  approve: `${INSPECTOR_API_BASE}/actions/tools/:id/approve`,
  deny: `${INSPECTOR_API_BASE}/actions/tools/:id/deny`,
});

export interface ToolApprovalActionInput {
  readonly toolId: string;
  readonly invocationId: string;
  readonly toolCallId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly idempotencyKey: string;
}

export async function toolActionCapabilities(
  client: Pick<InspectorApiClient, "request">,
): Promise<readonly string[]> {
  const payload = await client.request<InspectorObject>(INSPECTOR_API_BASE);
  return Array.isArray(payload.capabilities)
    ? payload.capabilities.filter((value): value is string => typeof value === "string")
    : [];
}

export function supportsToolApproval(
  capabilities: readonly string[],
  action: ToolApprovalAction,
): boolean {
  return capabilities.includes(TOOL_APPROVAL_CAPABILITIES[action]);
}

export function invokeToolApproval(
  client: Pick<InspectorApiClient, "request">,
  action: ToolApprovalAction,
  input: ToolApprovalActionInput,
): Promise<InspectorObject> {
  return client.request<InspectorObject>(
    `${INSPECTOR_API_BASE}/actions/tools/${encodeURIComponent(input.toolId)}/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
      cacheTags: ["tools", "runtime"],
    },
  );
}
