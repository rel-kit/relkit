"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { invokeFunction, type FunctionInvocationResult } from "../../lib/function-invocation";
import { FunctionContract } from "./function-contract";
import { FunctionInvocation } from "./function-invocation";
import { FunctionSignals } from "./function-signals";

interface FunctionSnapshot {
  readonly node: InspectorObject;
  readonly generationId: string;
  readonly graphHash: string;
  readonly declaredEdges: readonly InspectorObject[];
  readonly observedEdges: readonly InspectorObject[];
}

export function FunctionDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [snapshot, setSnapshot] = useState<FunctionSnapshot>();
  const [logs, setLogs] = useState<readonly InspectorObject[]>([]);
  const [traces, setTraces] = useState<readonly InspectorObject[]>([]);
  const [error, setError] = useState(false);

  const loadSignals = () => {
    if (id === "") return;
    const api = createInspectorClient();
    void Promise.all([
      api.query<InspectorObject>("logs", { functionId: id, limit: 10 }),
      api.query<InspectorObject>("traces", { functionId: id, limit: 10 }),
    ])
      .then(([logPage, tracePage]) => {
        setLogs(logPage.items);
        setTraces(tracePage.items);
      })
      .catch(() => {
        setLogs([]);
        setTraces([]);
      });
  };

  useEffect(() => {
    if (id === "") return;
    let current = true;
    const api = createInspectorClient();
    void Promise.all([
      api.detail<InspectorObject>("functions", id),
      api.query<InspectorObject>("logs", { functionId: id, limit: 10 }),
      api.query<InspectorObject>("traces", { functionId: id, limit: 10 }),
    ])
      .then(([detail, logPage, tracePage]) => {
        const node = record(detail.node) ?? record(detail.descriptor) ?? record(detail);
        const generationId = text(detail.generationId);
        const graphHash = text(detail.graphHash);
        if (!current || node === undefined || generationId === "" || graphHash === "")
          throw new Error("Function unavailable");
        setSnapshot({
          node,
          generationId,
          graphHash,
          declaredEdges: records(detail.declaredEdges),
          observedEdges: records(detail.observedEdges),
        });
        setLogs(logPage.items);
        setTraces(tracePage.items);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [id]);

  if (error || snapshot === undefined)
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The function API is unavailable." : "Loading function contract…"}
      </section>
    );

  const api = createInspectorClient();
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Function detail</h1>
          <p className="lede">Contracts and telemetry are read from one active graph identity.</p>
        </div>
        <span className="badge">{text(snapshot.node.id) || id}</span>
      </header>
      <FunctionContract {...snapshot} />
      <FunctionInvocation
        functionId={id}
        generationId={snapshot.generationId}
        graphHash={snapshot.graphHash}
        invoke={(input) => invokeFunction(api, input)}
        onComplete={(_result: FunctionInvocationResult) => loadSignals()}
      />
      <FunctionSignals logs={logs} traces={traces} />
    </div>
  );
}

function records(value: unknown): readonly InspectorObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is InspectorObject => record(item) !== undefined)
    : [];
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
