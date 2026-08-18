import { INSPECTOR_API_BASE, type InspectorObject } from "./api-types";
import type { InspectorApiClient } from "./api";

export interface FunctionInvocationInput {
  readonly functionId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly input: unknown;
  readonly idempotencyKey: string;
}

export type FunctionInvocationResult = InspectorObject & {
  readonly output?: unknown;
  readonly action?: InspectorObject;
};

export function invokeFunction(
  client: Pick<InspectorApiClient, "request">,
  input: FunctionInvocationInput,
): Promise<FunctionInvocationResult> {
  return client.request<FunctionInvocationResult>(
    `${INSPECTOR_API_BASE}/actions/functions/${encodeURIComponent(input.functionId)}/invoke`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}
