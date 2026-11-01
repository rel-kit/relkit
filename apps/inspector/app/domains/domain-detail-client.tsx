"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CodeBlock } from "../../components/blocks/code-block";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import { Badge } from "../../components/ui/badge";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import type { GraphNode } from "../../lib/graph-model";
import {
  errorStatus,
  eventVersion,
  invocationMode,
  nodeSource,
  nodeTitle,
} from "../../lib/graph-node-meta";
import { useInspectorGraph } from "../../lib/use-graph";
import { DetailLayout } from "../detail-layout";
import { SourceLink } from "../source-link";
import {
  Count,
  DetailPending,
  EntityList,
  GraphAction,
  MetaItem,
  MethodChip,
  Quiet,
} from "./catalog-kit";
import { countSummary, domainContents } from "./domain-tree";

export function DomainDetailClient() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const { graph, error: graphError } = useInspectorGraph();
  const [service, setService] = useState<InspectorObject>();
  useEffect(() => {
    if (id === "") return;
    // The service descriptor only adds capability metadata; the page itself is graph-derived.
    void createInspectorClient()
      .detail<InspectorObject>("services", id)
      .then((detail) => setService(record(detail.node) ?? record(detail.descriptor)))
      .catch(() => setService(undefined));
  }, [id]);
  const contents = useMemo(
    () => (graph ? domainContents(graph).find((domain) => domain.id === id) : undefined),
    [graph, id],
  );

  if (graph === undefined)
    return (
      <DetailPending
        failed={graphError}
        failedTitle="The domain API is unavailable."
        loadingLabel="Loading domain metadata…"
      />
    );
  if (contents === undefined)
    return (
      <div className="route-page">
        <EmptyState
          title={`No domain named ${id} in the active graph`}
          description="It may have been renamed or removed in the latest generation."
          action={
            <Link
              href="/domains"
              className="text-xs text-foreground underline-offset-2 hover:underline"
            >
              Back to domains
            </Link>
          }
        />
      </div>
    );

  const capability = record(service?.capability) ?? record(contents.service?.meta?.capability);
  const capabilityKind = text(capability?.kind) || "generic";
  const owned = [...contents.functions, ...contents.events, ...contents.channels];
  const publicCount = owned.filter((node) => node.exposure === "public").length;
  const source = contents.service ? nodeSource(contents.service) : undefined;

  return (
    <DetailLayout
      header={{
        kicker: "Domain",
        title: <span className="font-mono">{contents.id}</span>,
        badges: (
          <>
            {capabilityKind === "generic" ? null : <Badge variant="info">{capabilityKind}</Badge>}
            <Badge>{countSummary(contents)}</Badge>
          </>
        ),
        description: "Public and internal artifacts are grouped by compiler-owned domain identity.",
        meta: (
          <>
            <MetaItem label="id" copy={contents.id}>
              {contents.id}
            </MetaItem>
            <MetaItem label="public">{`${publicCount} / ${owned.length}`}</MetaItem>
            {source ? <SourceLink source={source} /> : null}
          </>
        ),
        actions: <GraphAction id={contents.id} />,
      }}
      aside={
        <Section id="domain-facts" title="Domain detail">
          <DetailList
            items={[
              { label: "Domain ID", value: contents.id, mono: true, copy: contents.id },
              { label: "Capability", value: capabilityKind, mono: true },
              { label: "Public artifacts", value: String(publicCount), mono: true },
              {
                label: "Internal artifacts",
                value: String(owned.length - publicCount),
                mono: true,
              },
              {
                label: "Depends on",
                value: <DomainLinks ids={contents.dependsOn} />,
                mono: true,
              },
              { label: "Used by", value: <DomainLinks ids={contents.usedBy} />, mono: true },
            ]}
          />
        </Section>
      }
    >
      <Section
        id="domain-routes"
        title="Routes"
        description="HTTP routes whose handler lives in this domain"
        actions={<Count value={contents.routes.length} />}
        flush
      >
        <EntityList
          empty="No routes target this domain."
          rows={contents.routes.map((route) => ({
            key: route.node.id,
            href: `/routes/${encodeURIComponent(route.node.id)}`,
            lead: <MethodChip method={route.method} className="mr-0!" />,
            title: route.path,
            detail: route.target,
          }))}
        />
      </Section>
      <Section
        id="domain-functions"
        title="Functions"
        actions={<Count value={contents.functions.length} />}
        flush
      >
        <EntityList
          empty="No functions are declared."
          rows={contents.functions.map((node) => ({
            key: node.id,
            href: `/functions/${encodeURIComponent(node.id)}`,
            title: nodeTitle(node),
            detail: node.id,
            trailing: (
              <>
                {invocationMode(node) && invocationMode(node) !== "callable" ? (
                  <Quiet>{invocationMode(node)}</Quiet>
                ) : null}
                {node.exposure === "internal" ? <Badge>internal</Badge> : null}
              </>
            ),
          }))}
        />
      </Section>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <NodeSection
          id="domain-events"
          title="Events"
          nodes={contents.events}
          base="/events"
          empty="No events are declared."
          trailing={(node) => {
            const version = eventVersion(node);
            return (
              <>
                {version === undefined ? null : <Quiet>v{version}</Quiet>}
                {node.exposure === "internal" ? <Badge>internal</Badge> : null}
              </>
            );
          }}
        />
        <NodeSection
          id="domain-channels"
          title="Channels"
          nodes={contents.channels}
          base="/channels"
          empty="No channels are declared."
          trailing={(node) => <Quiet>{text(node.meta?.client) || "internal"}</Quiet>}
        />
      </div>
      <NodeSection
        id="domain-errors"
        title="Errors"
        description="Typed failures this domain's functions can return"
        nodes={contents.errors}
        base="/errors"
        empty="No errors are declared."
        label={(node) => node.id}
        trailing={(node) => {
          const status = errorStatus(node);
          return <Quiet>{status === undefined ? "default" : `HTTP ${status}`}</Quiet>;
        }}
      />
      {capability === undefined ? null : (
        <Section
          id="domain-capability"
          title="Capability metadata"
          description="Safe database or auth configuration"
        >
          <CodeBlock value={capability} label="capability metadata" maxHeight="20rem" />
        </Section>
      )}
    </DetailLayout>
  );
}

function NodeSection({
  id,
  title,
  description,
  nodes,
  base,
  empty,
  label = nodeTitle,
  trailing,
}: {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly nodes: readonly GraphNode[];
  readonly base: string;
  readonly empty: string;
  readonly label?: (node: GraphNode) => string;
  readonly trailing?: (node: GraphNode) => ReactNode;
}) {
  return (
    <Section
      id={id}
      title={title}
      description={description}
      actions={<Count value={nodes.length} />}
      flush
    >
      <EntityList
        empty={empty}
        rows={nodes.map((node) => ({
          key: node.id,
          href: `${base}/${encodeURIComponent(node.id)}`,
          title: label(node),
          trailing: trailing?.(node),
        }))}
      />
    </Section>
  );
}

function DomainLinks({ ids }: { readonly ids: readonly string[] }) {
  if (ids.length === 0) return <>none</>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {ids.map((domain) => (
        <Link
          key={domain}
          href={`/domains/${encodeURIComponent(domain)}`}
          className="text-foreground underline-offset-2 hover:underline"
        >
          {domain}
        </Link>
      ))}
    </span>
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
