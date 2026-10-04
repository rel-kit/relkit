"use client";

import type { ObservationRequest, InvocationOptions } from "./agent-hook.types.js";

import { useCallback, useEffect, useState } from "react";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { agentOperations, agentRuntime } from "./agent-runtime.js";
import { isAcceptedAgentRun } from "./agent-operations.service.js";
import { emptyAgentContent } from "./agent-observation.js";
import { requiredThreadId } from "./agent-continuation.js";
import { agentMethods } from "./agent-methods.js";
import { restoreAndObserve } from "./agent-observer.js";
import { reconcileAgentRun } from "./agent-reconcile.js";
import { useRelkitClient } from "./context.js";
import { pendingScopeKey } from "./pending.js";
import type { AgentSelector } from "./registry.types.js";
import type { AgentOutput } from "./agent-hook-types.js";
import type { AgentBase, AgentThreadOptions, UseAgentResult } from "./agent-hook-types.types.js";
export type * from "./agent-hook-types.js";

/**
 * Adapts the agent service into React state while keeping accepted work independent of view cleanup.
 * @typeParam Name - Declared resource or procedure selector.
 * @param name - Declared resource or selector identity.
 * @returns The projected agent state and declared invocation methods.
 */
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
      const receipt = await runExecutionPromise(
        agentRuntime,
        agentOperations.submit({
          client: runtime.client,
          scopeKey: scope,
          agentId: name,
          threadId,
          identity: runtime.identity,
          kind,
          payload,
          ...(options.resume === undefined ? {} : { resume: options.resume }),
          ...(state.snapshot === undefined ? {} : { snapshot: state.snapshot }),
          ...(state.threadId === threadId && activeRunId !== undefined ? { activeRunId } : {}),
        }),
      );
      if (kind === "run" && isAcceptedAgentRun(receipt)) {
        setObservation((current) => ({ threadId, revision: (current?.revision ?? 0) + 1 }));
      }
    },
    [activeRunId, name, runtime, state.snapshot, state.threadId],
  );
  return agentMethods(state, invoke, observe) as unknown as UseAgentResult<Name>;
}
