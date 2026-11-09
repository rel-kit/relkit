import { Effect } from "effect";
import { runHttp } from "./http-effect.js";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { type AgentInput } from "./agent-rpc-support.js";

import { AgentReads, AgentReadsLive } from "./agent-reads.js";
export { AgentReads, AgentReadsLive } from "./agent-reads.js";
/** Executes listAgentThreads at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Up to 100 authorized thread summaries.
 */
export function listAgentThreads(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentReads;
      return yield* service.listAgentThreads(input, context, options);
    }).pipe(Effect.provide(AgentReadsLive)),
  );
}

/** Executes loadAgent at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The compatible browser snapshot within the initial snapshot byte limit.
 */
export function loadAgent(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentReads;
      return yield* service.loadAgent(input, context, options);
    }).pipe(Effect.provide(AgentReadsLive)),
  );
}

export { observeAgent } from "./agent-observation.js";

/** Executes lookupAgentReceipt at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The matching scoped receipt, or the provider's missing or expired result.
 */
export function lookupAgentReceipt(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentReads;
      return yield* service.lookupAgentReceipt(input, context, options);
    }).pipe(Effect.provide(AgentReadsLive)),
  );
}

/** Executes readAgentHistory at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The requested immutable snapshot page within the history byte limit.
 */
export function readAgentHistory(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentReads;
      return yield* service.readAgentHistory(input, context, options);
    }).pipe(Effect.provide(AgentReadsLive)),
  );
}
