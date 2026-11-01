"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, History, RotateCcw } from "lucide-react";
import { FailedState, LoadingRows } from "../../../../components/blocks/block-state";
import { CodeBlock } from "../../../../components/blocks/code-block";
import { Section } from "../../../../components/blocks/section";
import { StatusBadge, statusTone } from "../../../../components/neon/status-badge";
import { Button } from "../../../../components/ui/button";
import { ContentTabs } from "../../../../components/ui/tabs";
import { DetailLayout } from "../../../detail-layout";
import { JobsTabs } from "../../jobs-tabs";
import type { InspectorObject } from "../../../../lib/api-types";
import { createInspectorClient } from "../../../../lib/client";
import {
  isActive,
  record,
  RunJsonPanel,
  RunLifecycle,
  RunOverview,
  text,
} from "./run-detail-sections";

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
      <>
        <JobsTabs />
        <div className="route-page rounded-lg border border-border bg-card">
          <LoadingRows label="Loading run…" rows={6} />
        </div>
      </>
    );
  if (state === "error" || run === undefined)
    return (
      <>
        <JobsTabs />
        <div className="route-page">
          <FailedState
            title="The run is unavailable or expired."
            description="Retained run history is bounded; older runs are dropped by the jobs service."
          />
        </div>
      </>
    );
  const jobId = text(run.jobId);
  const taskId = text(run.taskId);
  const status = text(run.status) || "unknown";
  return (
    <>
      <JobsTabs />
      <DetailLayout
        header={{
          kicker: "Run detail",
          title: <span className="font-mono text-lg">{id}</span>,
          icon: <History />,
          description:
            "Native evidence, normalized status, and retained output are shown separately.",
          badges: <StatusBadge tone={statusTone(status)} label={status} />,
          meta: (
            <>
              <span aria-label={`Run ID ${id}`}>{id}</span>
              {jobId === "" ? null : <span>job {jobId}</span>}
              {text(run.service) === "" ? null : <span>{text(run.service)}</span>}
            </>
          ),
          actions: (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Run controls"
            >
              <label className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground select-none">
                <input
                  checked={live}
                  className="size-3.5 accent-[var(--live)]"
                  onChange={(event) => setLive(event.target.checked)}
                  type="checkbox"
                />
                Live refresh
              </label>
              <Button
                variant="secondary"
                size="sm"
                isDisabled={pending !== "" || !isActive(status)}
                onPress={() => void control("cancel")}
              >
                <Ban aria-hidden="true" />
                {pending === "cancel" ? "Requesting cancellation…" : "Cancel run"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                isDisabled={pending !== "" || isActive(status)}
                onPress={() => void control("retry")}
              >
                <RotateCcw aria-hidden="true" />
                {pending === "retry" ? "Requesting retry…" : "Retry as new run"}
              </Button>
              <span aria-live="polite" className="sr-only">
                {receipt === undefined
                  ? ""
                  : "Request receipt recorded; waiting for native confirmation."}
              </span>
            </div>
          ),
        }}
        aside={
          <Section title="Lifecycle" description="Attempts, waits and transitions">
            <RunLifecycle run={run} status={status} />
          </Section>
        }
      >
        {receipt !== undefined && (
          <Section title="Request receipt" description="Recorded; waiting for native confirmation.">
            <div role="status">
              <CodeBlock value={receipt} label="request receipt" maxHeight="12rem" />
            </div>
          </Section>
        )}
        <Section title="Overview">
          <RunOverview
            run={run}
            evidence={evidence}
            jobId={jobId}
            taskId={taskId}
            status={status}
          />
        </Section>
        <Section title="Run record">
          <ContentTabs
            label="Run detail sections"
            items={[
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
                id: "progress",
                label: "Progress & streams",
                content: (
                  <RunJsonPanel
                    value={{
                      progress: run.progress,
                      nativeDiagnosticCode: run.nativeDiagnosticCode,
                    }}
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
        </Section>
      </DetailLayout>
    </>
  );
}
