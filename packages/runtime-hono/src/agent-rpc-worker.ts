import type { AcceptRunReceipt, AgentConversationMessage, BrowserMessage } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { type agentContext } from "./agent-rpc-support.js";
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

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;
export function startAgentRun(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  input: unknown,
  options: RouteMaterializationOptions,
  resume = false,
  controlRunIds: readonly string[] = [receipt.runId],
): void {
  trackAgentRun(receipt.runId, () => {
    const task = execute(
      resolved,
      receipt,
      input,
      options,
      new AbortController(),
      resume,
      controlRunIds,
    );
    options.agentRuntime?.track?.(task);
    return task;
  });
}

async function execute(
  resolved: ResolvedAgent,
  receipt: AcceptRunReceipt,
  input: unknown,
  options: RouteMaterializationOptions,
  controller: AbortController,
  resume: boolean,
  controlRunIds: readonly string[],
): Promise<void> {
  const runtimeSignal = options.agentRuntime?.signal;
  const stopForGeneration = (): void =>
    controller.abort(new Error("Owning generation is unavailable."));
  if (runtimeSignal?.aborted) stopForGeneration();
  else runtimeSignal?.addEventListener("abort", stopForGeneration, { once: true });
  const claim = await claimRun(resolved.provider, resolved, receipt, options).catch(
    () => undefined,
  );
  if (claim === undefined) return;
  const active: ActiveAgentExecution = {
    receipt,
    claim,
    controlRunIds: [...controlRunIds],
    steering: createAgentSteeringBuffer(),
  };
  const approvals = new AgentApprovalCoordinator(resolved, active, options);
  const progressSink = createAgentProgressSink(resolved, active);
  const assistantMessageId = crypto.randomUUID();
  const assistantCreatedAt = new Date().toISOString();
  const contentSink = createAgentContentSink(
    resolved,
    active,
    assistantMessageId,
    assistantCreatedAt,
  );
  let renewing = false;
  const renewal = setInterval(() => {
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    void resolved.provider
      .renewRunClaim({
        ...resolved.scope,
        threadId: active.receipt.threadId,
        runId: active.receipt.runId,
        claim: active.claim,
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
      })
      .then((next) => {
        active.claim = next;
      })
      .catch((error: unknown) => controller.abort(error))
      .finally(() => {
        renewing = false;
      });
  }, 15_000);
  renewal.unref?.();
  const controls = new AbortController();
  const controlWorker = consumeAgentControls(
    resolved,
    active,
    options,
    controller,
    approvals,
    controls.signal,
  );
  let startNext = false;
  try {
    const messages = resume ? [] : await previousMessages(resolved, active.receipt.threadId);
    if (!resume) await appendAgentMessage(resolved, active.receipt, active.claim, "user", input);
    const output = await options.engine.invoke({
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
    });
    await contentSink.ensureOutput(output, controller.signal);
    await completeAgentRun(resolved, active.receipt, active.claim, "succeeded", { output });
    startNext = true;
  } catch (error) {
    try {
      if (runtimeSignal?.aborted) {
        await interruptAgentRun(
          resolved,
          active.receipt,
          active.claim,
          agentRunOwner(options, resolved.scope.profile),
          "generation-unavailable",
        );
      } else if (!contentSink.isWaiting()) {
        await completeAgentRun(
          resolved,
          active.receipt,
          active.claim,
          controller.signal.aborted ? "cancelled" : "failed",
          { error: "Agent execution failed." },
        );
        startNext = !controller.signal.aborted;
      }
    } catch {
      await interruptAgentRun(
        resolved,
        active.receipt,
        active.claim,
        agentRunOwner(options, resolved.scope.profile),
      ).catch(() => undefined);
      startNext = false;
    }
  } finally {
    runtimeSignal?.removeEventListener("abort", stopForGeneration);
    clearInterval(renewal);
    controls.abort();
    await controlWorker.catch(() => undefined);
  }
  const next = await processAgentFollowUps(resolved, active, options, startNext).catch(
    () => undefined,
  );
  if (next !== undefined)
    startAgentRun(resolved, next.receipt, next.input, options, false, next.controlRunIds);
}

async function previousMessages(
  resolved: ResolvedAgent,
  threadId: string,
): Promise<readonly AgentConversationMessage[]> {
  const chat = resolved.descriptor.chat;
  if (typeof chat?.input !== "string" || typeof chat.output !== "string") return [];
  const mapping = { input: chat.input, output: chat.output };
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  return snapshot.currentMessages.flatMap((message) => modelMessage(message, mapping));
}

function modelMessage(
  message: BrowserMessage,
  chat: { readonly input: string; readonly output: string },
): readonly AgentConversationMessage[] {
  if (message.role !== "user" && message.role !== "assistant") return [];
  const part = message.parts.find(
    (candidate) =>
      candidate.kind === "text" && (message.role === "user" || candidate.state !== "streaming"),
  );
  if (part?.kind !== "text") return [];
  const field = message.role === "user" ? chat.input : chat.output;
  return [{ role: message.role, content: JSON.stringify({ [field]: part.text }) }];
}
