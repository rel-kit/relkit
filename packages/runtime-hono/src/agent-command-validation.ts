import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { createOperationId, parseOperationId } from "@relkit/realtime";

import { assertExpectedIdentity, assertRpcSecurity } from "./rpc-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { type AgentInput } from "./agent-rpc-support.js";

/** Checks client identity and transport security before mutating durable agent state.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Completion after identity and optional transport-security checks pass.
 */
export async function assertWrite(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  await assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity);
  if (options.transportSecurity !== undefined)
    await assertRpcSecurity(context, options.transportSecurity);
}

/** Validates a supplied operation identifier or creates one within the receipt window.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The validated operation ID within the supported receipt window.
 */
export function requiredOperationId(value: string | undefined) {
  return parseOperationId(value ?? createOperationId(), {
    receiptWindowMs: REALTIME_RUNTIME_LIMITS.agentReceiptMs,
  });
}

/** Checks the public payload shape required by the selected control kind.
 * @param kind - Declared stage or control kind selecting the relevant policy.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
export function isControlPayload(
  kind: string | undefined,
  value: unknown,
): value is object | string {
  if (kind === "steer" || kind === "follow-up") return typeof value === "string";
  return value !== null && typeof value === "object";
}
