"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { v7 as createOperationId } from "uuid";
import type { AgentView } from "../lib/agents-model";
import {
  applyAgentObservation,
  conversationFromSnapshot,
  emptyAgentConversation,
} from "./agent-observation";
import { observeAgentThread } from "./agent-live-observer";
import {
  completesRunStart,
  prepareAgentInput,
  queuedFollowUps,
  runtimeErrorMessage,
  setThreadUrl,
  storageKey,
} from "./agent-live-runtime-support";
import {
  applicationProcedure,
  listAgentThreads,
  useApplicationRuntimeClient,
} from "./application-runtime-client";
import type { ThreadSnapshot } from "./application-runtime-types";
export function useAgentLiveRuntime(view: AgentView) {
  const runtime = useApplicationRuntimeClient();
  const [threadId, setThreadId] = useState("");
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState(emptyAgentConversation);
  const [pending, setPending] = useState(false);
  const [runStarting, setRunStarting] = useState(false);
  const [error, setError] = useState("");
  const observer = useRef<AbortController>();
  const previousStorageKey = useRef<string>();
  const status = runStarting ? "running" : (conversation.snapshot?.thread.status ?? "idle");
  const restore = useCallback(
    async (nextThreadId: string) => {
      if (runtime.status !== "ready" || runtime.identity === undefined) return;
      observer.current?.abort();
      const controller = new AbortController();
      observer.current = controller;
      let installed = false;
      setError("");
      try {
        const loaded = (await applicationProcedure(runtime.client, "relkit.agent.load")(
          { agentId: view.id, threadId: nextThreadId, expectedIdentity: runtime.identity },
          { signal: controller.signal },
        )) as ThreadSnapshot;
        if (controller.signal.aborted) return;
        installed = true;
        setThreadId(nextThreadId);
        setConversation(conversationFromSnapshot(loaded));
        setRunStarting(false);
        sessionStorage.setItem(storageKey(view.id, runtime.identity), nextThreadId);
        setThreadUrl(nextThreadId);
        await observeAgentThread({
          client: runtime.client,
          agentId: view.id,
          threadId: nextThreadId,
          identity: runtime.identity,
          after: loaded.checkpoint,
          signal: controller.signal,
          onObservation: (next) => {
            if (completesRunStart(next)) setRunStarting(false);
            setConversation((current) => applyAgentObservation(current, next));
          },
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        controller.abort(cause);
        if (!installed) {
          sessionStorage.removeItem(storageKey(view.id, runtime.identity));
          setThreadId("");
          setConversation(emptyAgentConversation);
        }
        setError(runtimeErrorMessage(cause));
      }
    },
    [runtime.client, runtime.identity, runtime.status, view.id],
  );
  useEffect(() => () => observer.current?.abort(), []);
  useEffect(() => {
    if (runtime.status !== "ready" || runtime.identity === undefined) return;
    const key = storageKey(view.id, runtime.identity);
    if (previousStorageKey.current !== undefined && previousStorageKey.current !== key) {
      sessionStorage.removeItem(previousStorageKey.current);
      observer.current?.abort();
      setThreadId("");
      setConversation(emptyAgentConversation);
    }
    previousStorageKey.current = key;
    const urlThread = new URL(window.location.href).searchParams.get("thread");
    const target = urlThread ?? sessionStorage.getItem(key);
    if (target !== null && target !== threadId) void restore(target);
  }, [restore, runtime.identity, runtime.status, threadId, view.id]);
  const submit = useCallback(
    async (
      kind: string,
      payload: unknown,
      continuation?: { readonly resume: true; readonly waitingRevision: string },
    ) => {
      if (runtime.status !== "ready" || runtime.identity === undefined) return;
      const nextThreadId = threadId === "" && kind === "run" ? createOperationId() : threadId;
      if (nextThreadId === "") {
        setError("Select a thread before sending a control.");
        return;
      }
      if (threadId === "") {
        setThreadId(nextThreadId);
        sessionStorage.setItem(storageKey(view.id, runtime.identity), nextThreadId);
        setThreadUrl(nextThreadId);
      }
      observer.current?.abort();
      observer.current = undefined;
      setPending(true);
      if (kind === "run") setRunStarting(true);
      setError("");
      try {
        const receipt = (await applicationProcedure(
          runtime.client,
          kind === "run" ? "relkit.agent.run" : "relkit.agent.control",
        )({
          agentId: view.id,
          expectedIdentity: runtime.identity,
          threadId: nextThreadId,
          operationId: createOperationId(),
          kind,
          payload,
          ...continuation,
        })) as { readonly threadId?: string };
        if (receipt.threadId !== undefined) {
          if (receipt.threadId !== nextThreadId || observer.current?.signal.aborted !== false)
            void restore(receipt.threadId);
        } else if (kind === "run") setRunStarting(false);
      } catch (cause) {
        if (kind === "run") setRunStarting(false);
        const failure = runtimeErrorMessage(cause);
        void restore(nextThreadId).finally(() => setError(failure));
      } finally {
        setPending(false);
      }
    },
    [restore, runtime.client, runtime.identity, runtime.status, threadId, view.id],
  );
  function send(event: FormEvent) {
    event.preventDefault();
    if (input.trim() === "") return;
    const prepared = prepareAgentInput(view, status, input);
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }
    setInput("");
    void submit(prepared.kind, prepared.payload);
  }
  function steer() {
    if (input.trim() === "") return;
    const message = input;
    setInput("");
    void submit("steer", message);
  }
  function newChat() {
    observer.current?.abort();
    const nextThreadId = createOperationId();
    if (runtime.identity !== undefined) {
      sessionStorage.removeItem(storageKey(view.id, runtime.identity));
      sessionStorage.setItem(storageKey(view.id, runtime.identity), nextThreadId);
    }
    setThreadId(nextThreadId);
    setConversation(emptyAgentConversation);
    setRunStarting(false);
    setError("");
    setThreadUrl(nextThreadId);
  }
  return {
    runtimeStatus: runtime.status,
    threadId,
    input,
    conversation,
    pending,
    error,
    status,
    queuedFollowUps: queuedFollowUps(conversation.snapshot),
    setInput,
    listThreads: () => listAgentThreads(runtime, view.id),
    restore,
    submit,
    send,
    steer,
    newChat,
    resume: (reply: unknown) => {
      const waiting = conversation.snapshot?.waiting;
      if (waiting === undefined) {
        setError("This thread is not waiting for human input.");
        return;
      }
      void submit("run", reply, { resume: true, waitingRevision: waiting.revision });
    },
  };
}
