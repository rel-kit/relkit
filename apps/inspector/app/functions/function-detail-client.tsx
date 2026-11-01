"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { invokeFunction, type FunctionInvocationResult } from "../../lib/function-invocation";
import { Radio } from "lucide-react";
import { Section } from "../../components/blocks/section";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { SourceLink } from "../source-link";
import { DetailPending, ExposureBadge, GraphAction, MetaItem } from "../domains/catalog-kit";
import { FunctionContract, FunctionFacts } from "./function-contract";
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
      api
        .query<InspectorObject>("logs", { functionId: id, limit: 10 })
        .catch(() => ({ items: [] as readonly InspectorObject[] })),
      api
        .query<InspectorObject>("traces", { functionId: id, limit: 10 })
        .catch(() => ({ items: [] as readonly InspectorObject[] })),
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
      <DetailPending
        failed={error}
        failedTitle="The function API is unavailable."
        loadingLabel="Loading function contract…"
      />
    );

  const api = createInspectorClient();
  const node = snapshot.node;
  const functionId = text(node.id) || id;
  const domainId = text(node.domainId);
  const eventOnly = node.invocationMode === "event-only";
  return (
    <DetailLayout
      header={{
        kicker: "Function",
        title: <span className="font-mono">{functionId}</span>,
        badges: (
          <>
            <ExposureBadge exposure={node.exposure} />
            <Badge>{text(node.invocationMode) || "callable"}</Badge>
          </>
        ),
        meta: (
          <>
            {domainId ? (
              <MetaItem label="domain">
                <Link
                  href={`/domains/${encodeURIComponent(domainId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {domainId}
                </Link>
              </MetaItem>
            ) : null}
            <MetaItem label="generation">{snapshot.generationId}</MetaItem>
            <SourceLink source={record(node.source)} />
          </>
        ),
        actions: <GraphAction id={functionId} />,
      }}
      aside={<FunctionFacts {...snapshot} />}
    >
      {eventOnly ? (
        <Section id="function-invocation-note">
          <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
            <Radio aria-hidden="true" className="size-3.5" />
            This function runs only through event delivery or replay.
          </p>
        </Section>
      ) : (
        <FunctionInvocation
          functionId={id}
          generationId={snapshot.generationId}
          graphHash={snapshot.graphHash}
          inputSchema={node.input}
          invoke={(input) => invokeFunction(api, input)}
          onComplete={(_result: FunctionInvocationResult) => loadSignals()}
        />
      )}
      <FunctionSignals logs={logs} traces={traces} />
      <FunctionContract {...snapshot} />
    </DetailLayout>
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
