"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { CodeBlock } from "../../components/blocks/code-block";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { StatusBadge, type StatusTone } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { SchemaPanel } from "../schema-panel";
import { SourceLink } from "../source-link";
import {
  Count,
  DetailPending,
  EntityList,
  ExposureBadge,
  GraphAction,
  MetaItem,
  plural,
} from "../domains/catalog-kit";

export function ErrorDetailClient() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const [detail, setDetail] = useState<InspectorObject>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (id === "") return;
    void createInspectorClient()
      .detail<InspectorObject>("errors", id)
      .then(setDetail)
      .catch(() => setError(true));
  }, [id]);
  const node = record(detail?.node) ?? record(detail?.descriptor);
  if (node === undefined) {
    return (
      <DetailPending
        failed={error}
        failedTitle="The error API is unavailable."
        loadingLabel="Loading error contract…"
      />
    );
  }
  const errorId = text(node.id) || id;
  const domainId = text(node.domainId) || text(errorId.split(".")[0]);
  const status = record(node.http)?.status;
  const statusLabel = typeof status === "number" ? String(status) : "default";
  const edges: readonly InspectorObject[] = Array.isArray(detail?.declaredEdges)
    ? detail.declaredEdges.flatMap((edge: unknown): InspectorObject[] => {
        const entry = record(edge);
        return entry === undefined ? [] : [entry];
      })
    : [];
  const declarers = edges.filter((edge) => text(edge.to) === errorId);
  const other = edges.filter((edge) => text(edge.to) !== errorId);
  return (
    <DetailLayout
      header={{
        kicker: "Error",
        title: <span className="font-mono">{errorId}</span>,
        badges: (
          <>
            <ExposureBadge exposure={node.exposure} />
            <StatusBadge tone={httpTone(status)} label={`HTTP ${statusLabel}`} />
          </>
        ),
        description:
          "One source of truth for runtime, OpenAPI, client, and Inspector error contracts.",
        meta: (
          <>
            <MetaItem label="id" copy={errorId}>
              {errorId}
            </MetaItem>
            {text(node.domainId) ? <MetaItem label="domain">{text(node.domainId)}</MetaItem> : null}
            <SourceLink source={record(node.source)} />
          </>
        ),
        actions: <GraphAction id={errorId} />,
      }}
      aside={
        <Section id="error-facts" title="Error detail">
          <DetailList
            items={[
              { label: "Error ID", value: errorId, mono: true, copy: errorId },
              { label: "Namespace", value: domainId || "—", mono: true },
              { label: "Exposure", value: text(node.exposure) || "internal", mono: true },
              { label: "HTTP status", value: statusLabel, mono: true },
              { label: "Retry", value: text(node.retry) || "never", mono: true },
              { label: "Declared by", value: plural(declarers.length, "function"), mono: true },
            ]}
          />
        </Section>
      }
    >
      <SchemaPanel title="Data contract" value={node.data} />
      <Section
        id="error-declarers"
        title="Declared by"
        description="Functions whose contract can return this error"
        actions={<Count value={declarers.length} />}
        flush
      >
        <EntityList
          empty="No functions declare this error."
          rows={declarers.map((edge, index) => {
            const from = text(edge.from);
            return {
              key: `${from}:${index}`,
              href: from ? `/functions/${encodeURIComponent(from)}` : undefined,
              title: from || "unknown",
              trailing: <Badge>{text(edge.kind) || "declares-error"}</Badge>,
            };
          })}
        />
      </Section>
      {other.length === 0 ? null : (
        <Section id="error-relationships" title="Other declared relationships">
          <CodeBlock value={other} label="declared relationships" maxHeight="18rem" />
        </Section>
      )}
    </DetailLayout>
  );
}

function httpTone(status: unknown): StatusTone {
  if (typeof status !== "number") return "neutral";
  return status >= 500 ? "danger" : status >= 400 ? "warning" : "info";
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
