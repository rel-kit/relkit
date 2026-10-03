import { Context, Effect, Layer } from "effect";
import { observeHttp, runHttp } from "./http-effect.js";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { type AgentInput } from "./agent-rpc-support.js";

import { acceptAgentRunEffect } from "./agent-run-admission.js";
import { acceptAgentControlEffect } from "./agent-control-admission.js";
/** Executes acceptAgentRun at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The durable admission receipt after generation-owned execution has been started.
 */
export function acceptAgentRun(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentCommands;
      return yield* service.acceptAgentRun(input, context, options);
    }).pipe(Effect.provide(AgentCommandsLive)),
  );
}

/** Executes acceptAgentControl at the native Promise boundary.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The accepted control receipt for the current writable run.
 */
export function acceptAgentControl(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentCommands;
      return yield* service.acceptAgentControl(input, context, options);
    }).pipe(Effect.provide(AgentCommandsLive)),
  );
}

/** Lazy agent domain workflows with typed native failures. */
export class AgentCommands extends Context.Service<
  AgentCommands,
  {
    readonly acceptAgentRun: typeof acceptAgentRunEffect;
    readonly acceptAgentControl: typeof acceptAgentControlEffect;
  }
>()("@relkit/runtime-hono/AgentCommands") {}

/** Live operations; tests can replace the same contract. */
export const AgentCommandsLive = Layer.succeed(AgentCommands, {
  acceptAgentRun: (...args) => observeHttp("agent.acceptAgentRun", acceptAgentRunEffect(...args)),
  acceptAgentControl: (...args) =>
    observeHttp("agent.acceptAgentControl", acceptAgentControlEffect(...args)),
});
