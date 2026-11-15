import { INSPECTOR_API_BASE, type InspectorObject } from "./api-types";
import type { InspectorApiClient } from "./api";
import { retryOnStaleGeneration } from "./inspector-actions";

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

/** Invokes a function; after an application reload the call is repeated once on the new generation. */
export function invokeFunction(
  client: Pick<InspectorApiClient, "request" | "graph" | "invalidate">,
  input: FunctionInvocationInput,
): Promise<FunctionInvocationResult> {
  return retryOnStaleGeneration(client, input, (identity) =>
    client.request<FunctionInvocationResult>(
      `${INSPECTOR_API_BASE}/actions/functions/${encodeURIComponent(input.functionId)}/invoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
        body: JSON.stringify({ ...input, ...identity }),
      },
    ),
  );
}
