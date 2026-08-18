"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { invokeJobAction, jobActionCapabilities, type JobAction } from "../../lib/job-actions";
import { JobContract } from "./job-contract";

interface JobSnapshot {
  readonly node: InspectorObject;
  readonly runtime: readonly InspectorObject[];
  readonly capabilities: readonly string[];
  readonly generationId: string;
  readonly graphHash: string;
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

  if (error || snapshot === undefined)
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The job API is unavailable." : "Loading job contract…"}
      </section>
    );

  const jobId = text(snapshot.node.id) || id;
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Job detail</h1>
          <p className="lede">
            Queue state and local administrative actions stay tied to one active graph identity.
          </p>
        </div>
        <span className="badge">{jobId}</span>
      </header>
      {actionError !== "" && (
        <p className="field-errors" role="alert">
          {actionError}
        </p>
      )}
      <JobContract
        node={snapshot.node}
        instances={snapshot.runtime}
        knownJobIds={[jobId]}
        capabilities={snapshot.capabilities}
        pending={pending}
        onAction={action}
      />
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
