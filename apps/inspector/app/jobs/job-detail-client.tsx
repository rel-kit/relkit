"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { invokeJobAction, jobActionCapabilities, type JobAction } from "../../lib/job-actions";
import { Briefcase } from "lucide-react";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { StatusBadge } from "../../components/neon/status-badge";
import { middleTruncate } from "../../lib/format";
import { DetailLayout } from "../detail-layout";
import { JobContract, JobContractAside } from "./job-contract";
import { ModernJobDetail } from "./modern-job-detail";

interface JobSnapshot {
  readonly node: InspectorObject;
  readonly runtime: readonly InspectorObject[];
  readonly capabilities: readonly string[];
  readonly generationId: string;
  readonly graphHash: string;
}
interface ModernSnapshot {
  readonly definition: InspectorObject;
  readonly runs: readonly InspectorObject[];
}

export function JobDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [snapshot, setSnapshot] = useState<JobSnapshot>();
  const [modern, setModern] = useState<ModernSnapshot>();
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const api = useMemo(() => createInspectorClient(), []);

  const load = useCallback(async () => {
    if (id === "") return;
    try {
      const detail = await api.jobDefinition<InspectorObject>(id);
      const definition = record(detail.definition) ?? record(detail);
      if (definition === undefined) throw new Error("Job definition unavailable");
      const runs = await api.jobRuns<InspectorObject>({
        jobId: text(definition.jobId) || id,
        limit: 25,
      });
      setModern({ definition, runs: runs.items });
      setSnapshot(undefined);
      setError(false);
      return;
    } catch {}
    const [detail, runtime, capabilities] = await Promise.all([
      api.detail<InspectorObject>("jobs", id),
      api.runtimeList<InspectorObject>("jobs", { limit: 100 }),
      jobActionCapabilities(api).catch(() => []),
    ]);
    const node = record(detail.node) ?? record(detail.descriptor) ?? record(detail);
    const generationId = text(detail.generationId);
    const graphHash = text(detail.graphHash);
    if (node === undefined || generationId === "" || graphHash === "")
      throw new Error("Job unavailable");
    setSnapshot({ node, runtime: runtime.items, capabilities, generationId, graphHash });
    setError(false);
  }, [api, id]);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  const action = async (kind: JobAction, instanceId: string) => {
    if (modern !== undefined) {
      setPending(true);
      setActionError("");
      try {
        await api.jobControl(instanceId, kind, { operationId: crypto.randomUUID() });
        api.invalidate(["jobs", "runtime"]);
        await load();
      } catch (failure) {
        setActionError(failure instanceof Error ? failure.message : "Job action failed.");
      } finally {
        setPending(false);
      }
      return;
    }
    if (snapshot === undefined) return;
    setPending(true);
    setActionError("");
    try {
      await invokeJobAction(api, kind, {
        instanceId,
        generationId: snapshot.generationId,
        graphHash: snapshot.graphHash,
        idempotencyKey: `inspector-job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      api.invalidate(["jobs", "runtime"]);
      await load();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Job action failed.");
      throw failure;
    } finally {
      setPending(false);
    }
  };

  if (modern !== undefined)
    return (
      <ModernJobDetail
        actionError={actionError}
        definition={modern.definition}
        runs={modern.runs}
        onAction={action}
        pending={pending}
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
  if (snapshot === undefined)
    return (
      <div className="route-page rounded-lg border border-border bg-card">
        <LoadingRows label="Loading job contract…" rows={6} />
      </div>
    );

  const jobId = text(snapshot.node.id) || id;
  return (
    <DetailLayout
      header={{
        kicker: "Job detail",
        title: jobId,
        icon: <Briefcase />,
        description:
          "Queue state and local administrative actions stay tied to one active graph identity.",
        badges: <StatusBadge tone="neutral" label={text(snapshot.node.profile) || "default"} />,
        meta: (
          <>
            <span>{snapshot.generationId}</span>
            <span title={snapshot.graphHash}>{middleTruncate(snapshot.graphHash, 28)}</span>
          </>
        ),
      }}
      aside={
        <JobContractAside node={snapshot.node} instances={snapshot.runtime} knownJobIds={[jobId]} />
      }
    >
      {actionError !== "" && <FailedState title={actionError} />}
      <JobContract
        node={snapshot.node}
        instances={snapshot.runtime}
        knownJobIds={[jobId]}
        capabilities={snapshot.capabilities}
        pending={pending}
        onAction={action}
      />
    </DetailLayout>
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
