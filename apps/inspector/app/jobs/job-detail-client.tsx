"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import type { JobAction } from "../../lib/job-actions";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { ModernJobDetail } from "./modern-job-detail";
import { JobTrigger } from "./job-trigger";
import type { ActionIdentity } from "../../lib/inspector-actions";

interface JobSnapshot {
  readonly definition: InspectorObject;
  readonly runs: readonly InspectorObject[];
  readonly identity?: ActionIdentity;
}

export function JobDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [snapshot, setSnapshot] = useState<JobSnapshot>();
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const api = useMemo(() => createInspectorClient(), []);

  const load = useCallback(async () => {
    if (id === "") return;
    const detail = await api.jobDefinition<InspectorObject>(id);
    const definition = record(detail.definition) ?? record(detail);
    if (definition === undefined) throw new Error("Job definition unavailable");
    const runs = await api.jobRuns<InspectorObject>({
      jobId: text(definition.jobId) || id,
      limit: 25,
    });
    const graph = await api.graph().catch(() => undefined);
    const identity =
      graph?.generationId !== undefined && graph.graphHash !== undefined
        ? { generationId: graph.generationId, graphHash: graph.graphHash }
        : undefined;
    setSnapshot({ definition, runs: runs.items, ...(identity === undefined ? {} : { identity }) });
    setError(false);
  }, [api, id]);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  const action = async (kind: JobAction, runId: string) => {
    setPending(true);
    setActionError("");
    try {
      await api.jobControl(runId, kind, { operationId: crypto.randomUUID() });
      api.invalidate(["jobs", "runtime"]);
      await load();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Job action failed.");
    } finally {
      setPending(false);
    }
  };

  if (snapshot !== undefined)
    return (
      <ModernJobDetail
        actionError={actionError}
        definition={snapshot.definition}
        runs={snapshot.runs}
        onAction={action}
        pending={pending}
        trigger={
          snapshot.identity === undefined ? undefined : (
            <JobTrigger
              jobId={text(snapshot.definition.jobId) || id}
              identity={snapshot.identity}
            />
          )
        }
      />
    );
  if (error)
    return (
      <div className="route-page">
        <FailedState
          title="The job API is unavailable."
          description="The job definition could not be read from the active generation."
          onRetry={() => void load().catch(() => setError(true))}
        />
      </div>
    );
  return (
    <div className="route-page rounded-lg border border-border bg-card">
      <LoadingRows label="Loading job…" rows={6} />
    </div>
  );
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
