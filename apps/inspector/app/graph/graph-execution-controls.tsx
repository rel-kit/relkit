"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { createInspectorApiClient } from "../../lib/api";
import { inspectorBackendUrl } from "../../lib/client";
import { useApplicationRuntimeClient } from "../application-runtime-client";

export function GraphExecutionControls({
  agents,
  onOverlay,
}: {
  readonly agents: readonly string[];
  readonly onOverlay: (agentId: string, value: unknown) => void;
}) {
  const runtime = useApplicationRuntimeClient();
  const client = useMemo(
    () => createInspectorApiClient({ baseUrl: inspectorBackendUrl(), cacheTtlMs: 0 }),
    [],
  );
  const [agentId, setAgentId] = useState(agents[0] ?? "");
  const [threadId, setThreadId] = useState("");
  const [mode, setMode] = useState<"live" | "history">("live");
  const [active, setActive] = useState<{
    agentId: string;
    threadId: string;
    mode: "live" | "history";
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (active === undefined || runtime.status !== "ready") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const value = await client.agentExecutions(active.agentId, active.threadId, active.mode);
        if (!controller.signal.aborted) {
          setError("");
          onOverlay(active.agentId, value);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Live execution is unavailable.");
      } finally {
        if (!controller.signal.aborted && active.mode === "live") timer = setTimeout(load, 1_000);
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active, client, onOverlay, runtime.status]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (agentId === "" || threadId.trim() === "") return;
    setActive({ agentId, threadId: threadId.trim(), mode });
  }

  return (
    <form className="graph-execution-controls" onSubmit={submit}>
      <label>
        <span>Agent</span>
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Thread ID</span>
        <input
          value={threadId}
          onChange={(event) => setThreadId(event.target.value)}
          placeholder="user:order:42"
          required
        />
      </label>
      <label>
        <span>Runs</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as "live" | "history")}
        >
          <option value="live">Live</option>
          <option value="history">History</option>
        </select>
      </label>
      <Button type="submit" isDisabled={runtime.status !== "ready" || agents.length === 0}>
        Show execution
      </Button>
      {error === "" ? null : <p role="alert">{error}</p>}
    </form>
  );
}
