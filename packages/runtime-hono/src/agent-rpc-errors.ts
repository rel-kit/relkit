import { ORPCError } from "@orpc/server";

const publicCodes = new Set([
  "AGENT_CAPABILITIES_UNSUPPORTED",
  "AGENT_APPROVAL_REQUIRED",
  "AGENT_BUSY",
  "AGENT_CONTROL_OVERLOADED",
  "AGENT_OUTPUT_TOO_LARGE",
  "AGENT_PRINCIPAL_OVERLOADED",
  "AGENT_PROVIDER_OVERLOADED",
  "AGENT_STOPPING",
  "AGENT_WORKER_INTERRUPTED",
  "AGENT_RUN_READ_ONLY",
  "GENERATION_UNAVAILABLE",
  "IDENTITY_PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_WINDOW_EXPIRED",
  "PROVIDER_STATE_LOST",
  "NOT_FOUND",
]);

export async function agentRpcCall<Value>(action: () => Promise<Value>): Promise<Value> {
  try {
    return await action();
  } catch (error) {
    throw agentRpcError(error);
  }
}

export async function* agentRpcStream<Value>(
  action: () => AsyncIterable<Value>,
): AsyncIterable<Value> {
  try {
    yield* action();
  } catch (error) {
    throw agentRpcError(error);
  }
}

export function agentRpcError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error;
  if (error instanceof TypeError) return new ORPCError("BAD_REQUEST", { message: error.message });
  const code = errorCode(error);
  if (code !== undefined && publicCodes.has(code)) {
    return new ORPCError(code, { message: publicMessage(code) });
  }
  return new ORPCError("INTERNAL_SERVER_ERROR");
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  return typeof (error as { readonly code?: unknown }).code === "string"
    ? (error as { readonly code: string }).code
    : undefined;
}

function publicMessage(code: string): string {
  if (code === "NOT_FOUND") return "Agent resource was not found.";
  if (code === "PROVIDER_STATE_LOST") return "Agent provider state changed.";
  if (code === "IDEMPOTENCY_WINDOW_EXPIRED") return "The idempotency window expired.";
  if (code === "IDEMPOTENCY_CONFLICT") return "The operation ID was reused with different content.";
  return code.toLowerCase().replaceAll("_", " ");
}
