import { os, type AnyProcedure, type ErrorMap } from "@orpc/server";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import type { AgentInput } from "./agent-rpc-support.js";
import {
  listAgentThreads,
  loadAgent,
  lookupAgentReceipt,
  observeAgent,
  readAgentHistory,
} from "./agent-rpc-read.js";
import { acceptAgentControl, acceptAgentRun } from "./agent-rpc-write.js";
import { agentRpcCall, agentRpcStream } from "./agent-rpc-errors.js";
import { assertAgentCapabilities } from "./agent-capability-negotiation.js";

export function agentProcedures(
  options: RouteMaterializationOptions,
): Readonly<Record<string, AnyProcedure>> {
  if (options.agentRuntime === undefined || options.clientIdentity === undefined) return {};
  const procedure = os.$context<RpcContext>().errors(agentErrors);
  return {
    "relkit.agent.threads": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => listAgentThreads(input as AgentInput, context, options)),
      ),
    ),
    "relkit.agent.load": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => loadAgent(input as AgentInput, context, options)),
      ),
    ),
    "relkit.agent.observe": procedure.handler(({ input, context, signal }) =>
      agentRpcStream(() =>
        negotiated(context, () => observeAgent(input as AgentInput, context, options, signal)),
      ),
    ),
    "relkit.agent.run": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => acceptAgentRun(input as AgentInput, context, options)),
      ),
    ),
    "relkit.agent.control": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => acceptAgentControl(input as AgentInput, context, options)),
      ),
    ),
    "relkit.agent.receipt": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => lookupAgentReceipt(input as AgentInput, context, options)),
      ),
    ),
    "relkit.agent.history": procedure.handler(({ input, context }) =>
      agentRpcCall(() =>
        negotiated(context, () => readAgentHistory(input as AgentInput, context, options)),
      ),
    ),
  };
}

export const agentErrorStatuses = {
  AGENT_CAPABILITIES_UNSUPPORTED: 409,
  AGENT_APPROVAL_REQUIRED: 409,
  AGENT_BUSY: 409,
  AGENT_CONTROL_OVERLOADED: 429,
  AGENT_OUTPUT_TOO_LARGE: 413,
  AGENT_PRINCIPAL_OVERLOADED: 429,
  AGENT_PROVIDER_OVERLOADED: 503,
  AGENT_RUN_READ_ONLY: 409,
  AGENT_STOPPING: 409,
  AGENT_WORKER_INTERRUPTED: 409,
  GENERATION_UNAVAILABLE: 500,
  IDENTITY_PRECONDITION_FAILED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_WINDOW_EXPIRED: 409,
  PROVIDER_STATE_LOST: 503,
} as const;

function negotiated<Value>(context: RpcContext, action: () => Value): Value {
  assertAgentCapabilities(context.hono.req.raw);
  return action();
}

const agentErrors = Object.fromEntries(
  Object.keys(agentErrorStatuses).map((code) => [code, {}]),
) as ErrorMap;
