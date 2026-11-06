/**
 * Defines request-owned continuation admission contracts. Provider and descriptor
 * authority come from authorization; service methods return durable accepted
 * receipts and preserve typed transport failures without retaining request scope.
 */
import type { Effect } from "effect";
import type { AgentWaitingRequest, OperationId } from "../contracts/index.js";
import type { AcceptRunReceipt } from "../agents/index.js";
import type { HttpBoundaryError } from "./http-effect.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { AgentInput, agentContext } from "./agent-rpc-support.js";

/** Authorized agent descriptor, provider and immutable durable request scope. */
export type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

/** Waiting revision is accepted only from the authorized provider snapshot. */
export type WaitingAgentContinuation = NonNullable<
  Awaited<ReturnType<ResolvedAgent["provider"]["loadThread"]>>["waiting"]
>;

/** Replaceable continuation service; each call supplies fresh request authority. */
export interface AgentContinuationOperations {
  readonly resume: (
    input: AgentInput,
    threadId: string,
    operationId: OperationId,
    resolved: ResolvedAgent,
    options: RouteMaterializationOptions,
  ) => Effect.Effect<AcceptRunReceipt, HttpBoundaryError>;
}

/** Resume validators from the optional `@relkit/langchain/continuation-validation` entry point. */
export interface ContinuationValidators {
  readonly isGraphDescriptor: (descriptor: unknown) => boolean;
  readonly validateGraphResumeInput: (
    descriptor: unknown,
    requests: readonly AgentWaitingRequest[],
    value: unknown,
  ) => Promise<unknown>;
  readonly validateNativeAgentResumeInput: (
    requests: readonly AgentWaitingRequest[],
    value: unknown,
  ) => unknown;
}
