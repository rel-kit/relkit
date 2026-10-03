import { Context, Effect, Layer, Result } from "effect";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-rpc-worker.types.js";
import { invokeHttpEngine } from "./http-invocation.js";
import type { AcceptRunReceipt } from "@relkit/agents";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { consumeAgentControls } from "./agent-control-worker.js";
import { AgentApprovalCoordinator, claimRun } from "./agent-approval-coordinator.js";
import { createAgentSteeringBuffer, type ActiveAgentExecution } from "./agent-active-execution.js";
import { createAgentProgressSink } from "./agent-progress-sink.js";
import { createAgentContentSink } from "./agent-content-sink.js";
import { processAgentFollowUps } from "./agent-follow-up.js";
import {
  agentRunOwner,
  appendAgentMessage,
  completeAgentRun,
  interruptAgentRun,
} from "./agent-run-journal.js";
import { trackAgentRun } from "./agent-run-tasks.js";
import { startAgentSupervision } from "./agent-run-supervision.js";
import { previousMessages } from "./agent-conversation.js";
/** Starts accepted work under its generation; the submitting connection owns only observation.
 * @param resolved - Authorized agent and durable provider scope.
 * @param receipt - Accepted run receipt, used to coalesce duplicate starts.
 * @param input - Validated run input.
 * @param options - Active generation dependencies.
 * @param resume - Whether the durable checkpoint supplies prior state.
 * @param controlRunIds - Runs whose queued follow-ups belong to this continuation.
 * @returns Nothing; generation tracking owns and joins the accepted task.
 */
export function startAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  input: unknown,
  options: RouteMaterializationOptions,
  resume = false,
  controlRunIds: readonly string[] = [receipt.runId],
): void {
  const task = trackAgentRun(
    receipt.runId,
    () =>
      runHttp(
        Effect.gen(function* () {
          const execution = yield* AgentExecution;
          yield* execution.execute(resolved, receipt, input, options, resume, controlRunIds);
        }).pipe(Effect.provide(AgentExecutionLive)),
      ),
    options.agentRuntime ?? options,
    options.agentRuntime?.signal,
  );
  options.agentRuntime?.track?.(task);
}

/** Executes and durably settles one run before admitting any follow-up.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param receipt - Durable accepted-run receipt identifying the thread and run.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param options - Application dependencies and configuration for this domain.
 * @param resume - Whether execution resumes from an admitted durable checkpoint.
 * @param controlRunIds - Run identifiers whose queued controls belong to this continuation chain.
 * @returns Completion after durable settlement, owned task cleanup and any follow-up admission.
 */
const execute = Effect.fn("AgentExecution.execute")(function* (
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  input: unknown,
  options: RouteMaterializationOptions,
  resume: boolean,
  controlRunIds: readonly string[],
) {
  const controller = new AbortController();
  const runtimeSignal = options.agentRuntime?.signal;
  const active = yield* Effect.scoped(
    Effect.gen(function* () {
      /** Aborts active work when its owning generation retires.
       * @returns Nothing; engine cancellation performs durable settlement.
       */
      const stop = (): void => controller.abort(new Error("Owning generation is unavailable."));
      if (runtimeSignal?.aborted) stop();
      else runtimeSignal?.addEventListener("abort", stop, { once: true });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => runtimeSignal?.removeEventListener("abort", stop)),
      );
      const claimed = yield* Effect.result(
        httpBoundary("agent.claim", () => claimRun(resolved.provider, resolved, receipt, options)),
      );
      if (Result.isFailure(claimed)) return undefined;
      const active: ActiveAgentExecution = {
        receipt,
        claim: claimed.success,
        controlRunIds: [...controlRunIds],
        steering: createAgentSteeringBuffer(),
      };
      const approvals = new AgentApprovalCoordinator(resolved, active, options);
      yield* Effect.addFinalizer(() => Effect.promise(() => approvals.close()));
      const progressSink = createAgentProgressSink(resolved, active);
      const contentSink = createAgentContentSink(
        resolved,
        active,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      const closeSupervision = yield* httpBoundary("agent.supervision.start", () =>
        startAgentSupervision({
          renew: async () => {
            if (controller.signal.aborted) return;
            active.claim = await resolved.provider.renewRunClaim({
              ...resolved.scope,
              threadId: active.receipt.threadId,
              runId: active.receipt.runId,
              claim: active.claim,
              expiresAt: new Date(Date.now() + 45_000).toISOString(),
            });
          },
          abort: (cause) => controller.abort(cause),
          controls: (signal) =>
            consumeAgentControls(resolved, active, options, controller, approvals, signal),
        }),
      );
      yield* Effect.addFinalizer(() => Effect.promise(closeSupervision));
      const result = yield* Effect.result(
        Effect.gen(function* () {
          const messages = resume
            ? []
            : yield* httpBoundary("agent.history", () =>
                previousMessages(resolved, active.receipt.threadId),
              );
          if (!resume)
            yield* httpBoundary("agent.input.journal", () =>
              appendAgentMessage(resolved, active.receipt, active.claim, "user", input),
            );
          const output = yield* httpBoundary("agent.invoke", () =>
            invokeHttpEngine(options.engine, {
              functionId: `relkit.agent.${resolved.node.id}.invoke`,
              input,
              source: "http",
              signal: controller.signal,
              progressSink,
              trigger: {
                kind: "agent-run",
                threadId: active.receipt.threadId,
                resume,
                approval: approvals.request,
                progressSink,
                contentSink,
                messages,
                steering: active.steering,
              },
            }),
          );
          yield* httpBoundary("agent.output", () =>
            contentSink.ensureOutput(output, controller.signal),
          );
          yield* httpBoundary("agent.complete", () =>
            completeAgentRun(resolved, active.receipt, active.claim, "succeeded", { output }),
          );
        }),
      );
      let startNext = Result.isSuccess(result);
      if (Result.isFailure(result)) {
        const settlement = yield* Effect.result(
          Effect.gen(function* () {
            if (runtimeSignal?.aborted) {
              yield* httpBoundary("agent.interrupt", () =>
                interruptAgentRun(
                  resolved,
                  active.receipt,
                  active.claim,
                  agentRunOwner(options, resolved.scope.profile),
                  "generation-unavailable",
                ),
              );
            } else if (!contentSink.isWaiting()) {
              yield* httpBoundary("agent.complete", () =>
                completeAgentRun(
                  resolved,
                  active.receipt,
                  active.claim,
                  controller.signal.aborted ? "cancelled" : "failed",
                  { error: "Agent execution failed." },
                ),
              );
              startNext = !controller.signal.aborted;
            }
          }),
        );
        if (Result.isFailure(settlement)) {
          yield* httpBoundary("agent.interrupt", () =>
            interruptAgentRun(
              resolved,
              active.receipt,
              active.claim,
              agentRunOwner(options, resolved.scope.profile),
            ),
          ).pipe(
            Effect.catch(() => Effect.logWarning("Agent durable settlement requires recovery")),
          );
          startNext = false;
        }
      }
      return { active, startNext };
    }),
  );
  if (active === undefined) return;
  const next = yield* httpBoundary("agent.followUps", () =>
    processAgentFollowUps(resolved, active.active, options, active.startNext),
  ).pipe(
    Effect.catch(() =>
      Effect.logWarning("Agent follow-up admission requires recovery").pipe(Effect.as(undefined)),
    ),
  );
  if (next !== undefined)
    startAgentRun(resolved, next.receipt, next.input, options, false, next.controlRunIds);
});

/** Generation-owned execution with scoped controls, renewal, approvals and durable settlement. */
export class AgentExecution extends Context.Service<
  AgentExecution,
  { readonly execute: typeof execute }
>()("@relkit/runtime-hono/AgentExecution") {}

/** Live accepted-run workflow; tests may provide the same contract for generation coordination. */
export const AgentExecutionLive = Layer.succeed(AgentExecution, {
  execute: (...args) => observeHttp("agent.execute", execute(...args)),
});
