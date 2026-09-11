"use client";

import { useCallback, useEffect, useState } from "react";
import { ORPCError } from "../index.js";
import { emptyAgentContent } from "./agent-observation.js";
import { prepareAgentContinuation, requiredThreadId } from "./agent-continuation.js";
import { agentMethods } from "./agent-methods.js";
import { restoreAndObserve } from "./agent-observer.js";
import { reconcileAgentRun } from "./agent-reconcile.js";
import { useRelkitClient } from "./context.js";
import { forgetPending, pendingScopeKey, rememberPending, updatePending } from "./pending.js";
import { procedureCall } from "./procedure.js";
import type { AgentSelector } from "./registry.js";
import type {
  AgentBase,
  AgentOutput,
  AgentThreadOptions,
  UseAgentResult,
} from "./agent-hook-types.js";
export type * from "./agent-hook-types.js";
type ObservationRequest = { readonly threadId: string; readonly revision: number };
type InvocationOptions = AgentThreadOptions & { readonly resume?: boolean };
export function useAgent<Name extends AgentSelector>(name: Name): UseAgentResult<Name> {
  const runtime = useRelkitClient();
  const [observation, setObservation] = useState<ObservationRequest>();
  const [state, setState] = useState<AgentBase<AgentOutput<Name>>>({
    status: "idle",
    ...emptyAgentContent(),
    events: [],
    executions: [],
  });
  const activeRunId = state.snapshot?.activeRun?.runId;
  useEffect(() => {
    if (runtime.status !== "ready" || runtime.scope === undefined) return;
    const controller = new AbortController();
    void reconcileAgentRun(runtime.client, pendingScopeKey(runtime.scope), name, controller.signal)
      .then((threadId) => {
        if (threadId !== undefined && !controller.signal.aborted) {
          setObservation((current) => ({
            threadId,
            revision: (current?.revision ?? 0) + 1,
          }));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [name, runtime.client, runtime.scope, runtime.status]);
  useEffect(() => {
    if (
      observation === undefined ||
      (runtime.status !== "ready" && runtime.status !== "application-updated")
    )
      return;
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", threadId: observation.threadId }));
    void restoreAndObserve(
      runtime.client,
      runtime.streamClient,
      name,
      observation.threadId,
      runtime.identity,
      controller.signal,
      setState,
    );
    return () => controller.abort();
  }, [name, observation, runtime.client, runtime.identity, runtime.status, runtime.streamClient]);
  const observe = useCallback(
    async (options: AgentThreadOptions): Promise<void> => {
      const threadId = requiredThreadId(options);
      if (runtime.status !== "ready" && runtime.status !== "application-updated") {
        throw new Error(`Relkit client is not ready (${runtime.status})`);
      }
      setObservation((current) => ({ threadId, revision: (current?.revision ?? 0) + 1 }));
    },
    [runtime.status],
  );
  const invoke = useCallback(
    async (kind: string, payload: unknown, options: InvocationOptions) => {
      if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identityKey === null)
        throw new Error(`Relkit client is not ready (${runtime.status})`);
      const threadId = requiredThreadId(options);
      const scope = pendingScopeKey(runtime.scope);
      const continuation =
        options.resume === true
          ? await prepareAgentContinuation(runtime.client, name, threadId, payload, state.snapshot)
          : undefined;
      const pending = await rememberPending(
        scope,
        continuation === undefined
          ? kind === "run"
            ? "agent-run"
            : "agent-control"
          : "continuation",
        name,
        continuation?.digestValue ?? payload,
        {
          threadId,
          ...(state.threadId === threadId && activeRunId !== undefined
            ? { runId: activeRunId }
            : {}),
        },
      );
      try {
        const call = procedureCall(
          runtime.client,
          kind === "run" ? "relkit.agent.run" : "relkit.agent.control",
        );
        const receipt = await call({
          agentId: name,
          expectedIdentity: runtime.identity,
          threadId,
          kind,
          payload,
          ...(options.resume === true ? { resume: true } : {}),
          ...(continuation === undefined ? {} : { waitingRevision: continuation.waitingRevision }),
          operationId: pending.operationId,
          requestDigest: pending.requestDigest,
        });
        updatePending(scope, { ...pending, state: "accepted" });
        if (kind === "run" && isAcceptedRun(receipt) && receipt.threadId !== threadId) {
          throw new Error("Relkit returned a different thread ID than the caller supplied.");
        }
        if (receipt !== undefined) {
          forgetPending(scope, pending.operationId);
          if (kind === "run" && isAcceptedRun(receipt)) {
            setObservation((current) => ({
              threadId,
              revision: (current?.revision ?? 0) + 1,
            }));
          }
        }
      } catch (error) {
        if (error instanceof ORPCError) forgetPending(scope, pending.operationId);
        else updatePending(scope, { ...pending, state: "unknown" });
        throw error;
      }
    },
    [activeRunId, name, runtime, state.snapshot, state.threadId],
  );
  return agentMethods(state, invoke, observe) as unknown as UseAgentResult<Name>;
}
function isAcceptedRun(value: unknown): value is { readonly threadId: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { threadId?: unknown }).threadId === "string"
  );
}
