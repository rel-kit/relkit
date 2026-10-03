import { applyControlEffect } from "./agent-control-application.js";
import { Context, Effect, Layer } from "effect";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-control-worker.types.js";

import type { RouteMaterializationOptions } from "./materialize-routes.js";

import { AgentApprovalCoordinator } from "./agent-approval-coordinator.js";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

/** Processes accepted controls sequentially until its generation-owned observer is cancelled.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param options - Application dependencies and configuration for this domain.
 * @param runController - Controller owning cancellation of the accepted execution.
 * @param approvals - Run-owned approval coordinator retaining unresolved decisions.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns Completion when the control iterator closes or its owning signal aborts.
 */
const consumeAgentControlsEffect = Effect.fn("AgentControls.consumeAgentControls")(function* (
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  runController: AbortController,
  approvals: AgentApprovalCoordinator,
  signal: AbortSignal,
) {
  let afterSequence: string | undefined;
  let runId = active.receipt.runId;
  while (!signal.aborted) {
    if (runId !== active.receipt.runId) {
      runId = active.receipt.runId;
      afterSequence = undefined;
    }
    const page = yield* httpBoundary("agent.controls.consumeAgentControls", () =>
      resolved.provider.readControls({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId,
        ...(afterSequence === undefined ? {} : { afterSequence }),
        limit: 32,
      }),
    );
    for (const operationId of page.operationIds) {
      yield* applyControlEffect(
        resolved,
        active.receipt.threadId,
        runId,
        options,
        operationId,
        runController,
        approvals,
        active,
      ).pipe(
        Effect.catch(() =>
          Effect.logWarning("Agent control could not be applied; continuing observation"),
        ),
      );
    }
    afterSequence = page.nextSequence;
    if (!page.hasMore)
      yield* httpBoundary("agent.controls.consumeAgentControls", () =>
        resolved.provider.waitForControls({
          ...resolved.scope,
          threadId: active.receipt.threadId,
          runId,
          afterSequence: page.nextSequence,
          deadlineMs: Date.now() + 15_000,
          signal,
        }),
      );
  }
});

/** Processes controls sequentially under the accepted run lifetime. */
export class AgentControls extends Context.Service<
  AgentControls,
  { readonly consume: typeof consumeAgentControlsEffect }
>()("@relkit/runtime-hono/AgentControls") {}

/** Live control processing keeps claim, effect-start and settlement ordering. */
export const AgentControlsLive = Layer.succeed(AgentControls, {
  consume: (...args) => observeHttp("agent.controls.consume", consumeAgentControlsEffect(...args)),
});

/** Native compatibility edge for the scoped control supervisor.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param options - Application dependencies and configuration for this domain.
 * @param runController - Controller owning cancellation of the accepted execution.
 * @param approvals - Run-owned approval coordinator retaining unresolved decisions.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns Completion when the control iterator closes or its owning signal aborts.
 */
export function consumeAgentControls(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  options: RouteMaterializationOptions,
  runController: AbortController,
  approvals: AgentApprovalCoordinator,
  signal: AbortSignal,
): Promise<void> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* AgentControls;
      yield* service.consume(resolved, active, options, runController, approvals, signal);
    }).pipe(Effect.provide(AgentControlsLive)),
    signal,
  );
}
