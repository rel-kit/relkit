"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContentTabs } from "../../../../components/ui/tabs";
import type { InspectorObject } from "../../../../lib/api-types";
import { createInspectorClient } from "../../../../lib/client";
import { isActive, record, RunJsonPanel, RunOverview, text } from "./run-detail-sections";

export function RunDetailClient() {
  const params = useParams<{ runId: string }>();
  const id = typeof params?.runId === "string" ? params.runId : "";
  const api = useMemo(() => createInspectorClient(), []);
  const [run, setRun] = useState<InspectorObject>();
  const [evidence, setEvidence] = useState<InspectorObject>();
  const [receipt, setReceipt] = useState<InspectorObject>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState("");
  const [live, setLive] = useState(true);
  const load = useCallback(async () => {
    if (id === "") return;
    const result = await api.jobRun<InspectorObject>(id);
    const value = record(result.run) ?? record(result);
    if (value === undefined) throw new Error("run unavailable");
    setRun(value);
    setEvidence(record(result.evidence));
    setState("ready");
  }, [api, id]);
  useEffect(() => {
    void load().catch(() => setState("error"));
  }, [load]);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [live, load]);

  const control = async (action: "cancel" | "retry"): Promise<void> => {
    setPending(action);
    try {
      const result = await api.jobControl<InspectorObject>(id, action, {
        operationId: crypto.randomUUID(),
      });
      setReceipt(result);
      await load();
    } catch (error) {
      setReceipt({ error: error instanceof Error ? error.message : "operation failed" });
    } finally {
      setPending("");
    }
  };

  if (state === "loading")
    return (
      <main className="route-page">
        <p className="panel route-state" role="status">
          Loading run…
        </p>
      </main>
    );
  if (state === "error" || run === undefined)
    return (
      <main className="route-page">
        <p className="panel route-state" role="alert">
          The run is unavailable or expired.
        </p>
      </main>
    );
  const jobId = text(run.jobId);
  const taskId = text(run.taskId);
  const status = text(run.status) || "unknown";
  return (
    <main className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">JOBS / RUN</p>
          <h1>Run detail</h1>
          <p className="lede">
            Native evidence, normalized status, and retained output are shown separately.
          </p>
        </div>
        <span className="badge" aria-label={`Run ID ${id}`}>
          {id}
        </span>
      </header>
      <section className="panel flex flex-wrap items-center gap-2" aria-label="Run controls">
        <label>
          <input
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
            type="checkbox"
          />{" "}
          Live refresh
        </label>
        <button
          className="button button-secondary"
          disabled={pending !== "" || !isActive(status)}
          onClick={() => void control("cancel")}
          type="button"
        >
          {pending === "cancel" ? "Requesting cancellation…" : "Cancel run"}
        </button>
        <button
          className="button button-secondary"
          disabled={pending !== "" || isActive(status)}
          onClick={() => void control("retry")}
          type="button"
        >
          {pending === "retry" ? "Requesting retry…" : "Retry as new run"}
        </button>
        <span aria-live="polite">
          {receipt === undefined
            ? ""
            : "Request receipt recorded; waiting for native confirmation."}
        </span>
      </section>
      {receipt !== undefined && (
        <pre className="safe-json" role="status">
          {JSON.stringify(receipt, null, 2)}
        </pre>
      )}
      <ContentTabs
        label="Run detail sections"
        items={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <RunOverview
                run={run}
                evidence={evidence}
                jobId={jobId}
                taskId={taskId}
                status={status}
              />
            ),
          },
          {
            id: "attempts",
            label: "Attempts & waits",
            content: (
              <RunJsonPanel
                value={{
                  attempt: run.attempt,
                  nextEligibleAt: run.nextEligibleAt,
                  scheduledFor: run.scheduledFor,
                  cancellation: run.cancellation,
                }}
              />
            ),
          },
          {
            id: "io",
            label: "Input/output",
            content: (
              <RunJsonPanel
                value={{
                  input: run.input,
                  output: run.output,
                  resultAvailability: run.resultAvailability,
                  inputHash: run.inputHash,
                  inputSchemaHash: run.inputSchemaHash,
                }}
              />
            ),
          },
          {
            id: "progress",
            label: "Progress & streams",
            content: (
              <RunJsonPanel
                value={{ progress: run.progress, nativeDiagnosticCode: run.nativeDiagnosticCode }}
              />
            ),
          },
          {
            id: "related",
            label: "Related runs/agents",
            content: (
              <RunJsonPanel
                value={{ parentRunId: run.parentRunId, retryOfRunId: run.retryOfRunId }}
              />
            ),
          },
        ]}
      />
    </main>
  );
}
