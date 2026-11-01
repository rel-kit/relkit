"use client";

import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Braces,
  Network,
  Radio,
  RadioTower,
  Route as RouteIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { PageHeader } from "../../components/blocks/page-header";
import { Section } from "../../components/blocks/section";
import { EmptyState } from "../../components/neon/empty-state";
import { TreeExplorer, type TreeGroup, type TreeLeaf } from "../../components/neon/tree-explorer";
import { Badge } from "../../components/ui/badge";
import type { GraphNode } from "../../lib/graph-model";
import { eventVersion, errorStatus, invocationMode, nodeTitle } from "../../lib/graph-node-meta";
import { useInspectorGraph } from "../../lib/use-graph";
import { Count, MethodChip } from "./catalog-kit";
import {
  APPLICATION_GROUP,
  countSummary,
  domainContents,
  type DomainContents,
} from "./domain-tree";

export function DomainsClient() {
  const { graph, loading, error } = useInspectorGraph();
  const domains = useMemo(() => (graph ? domainContents(graph) : []), [graph]);
  const groups = useMemo(() => domains.map(domainGroup), [domains]);
  const owned = domains.filter((domain) => domain.id !== APPLICATION_GROUP);
  const dependencies = owned.flatMap((domain) =>
    domain.dependsOn.map((target) => ({ from: domain.id, to: target })),
  );

  return (
    <div className="route-page">
      <PageHeader
        title="Domains"
        description="Each domain and the routes, functions, events, channels and errors it owns, read from the active graph."
        badges={
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {graph ? `${owned.length} domains` : "…"}
          </span>
        }
      />
      {graph === undefined ? (
        error ? (
          <FailedState
            title="The domain graph is unavailable. The active generation remains unchanged."
            description="The inspector keeps retrying as the backend reconnects."
          />
        ) : (
          <Section>
            <LoadingRows label={loading ? "Loading domains" : "Waiting for the graph"} rows={8} />
          </Section>
        )
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Boxes />}
          title="No domains declared"
          description="Domains appear here once the application declares services with functions, events, or channels."
        />
      ) : (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <TreeExplorer
            title="Application domains"
            subtitle={`${owned.length} domains · ${groups.reduce((total, group) => total + group.children.length, 0)} resources`}
            icon={<Boxes />}
            groups={groups}
            searchLabel="Search domains, routes, functions…"
            emptyLabel="No domain or resource matches this search."
            defaultOpen={groups[0] ? [groups[0].id] : []}
          />
          <aside className="grid min-w-0 gap-4 xl:sticky xl:top-16">
            <Section
              id="domain-dependencies"
              title="Dependencies"
              description="Domains that call into other domains"
              actions={<Count value={dependencies.length} />}
              flush
            >
              {dependencies.length === 0 ? (
                <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
                  No cross-domain dependencies are declared.
                </p>
              ) : (
                <ul className="m-0 list-none p-0" aria-label="Domain dependencies">
                  {dependencies.map((edge) => (
                    <li
                      key={`${edge.from}:${edge.to}`}
                      className="flex h-8 items-center gap-2 border-b border-border/60 px-4 font-mono text-xs last:border-b-0"
                    >
                      <Link
                        href={`/domains/${encodeURIComponent(edge.from)}`}
                        className="truncate text-foreground no-underline hover:underline"
                      >
                        {edge.from}
                      </Link>
                      <ArrowRight
                        aria-label="depends on"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                      <Link
                        href={`/domains/${encodeURIComponent(edge.to)}`}
                        className="truncate text-muted-foreground no-underline hover:text-foreground hover:underline"
                      >
                        {edge.to}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </aside>
        </div>
      )}
    </div>
  );
}

function domainGroup(domain: DomainContents): TreeGroup {
  const application = domain.id === APPLICATION_GROUP;
  const leaves: TreeLeaf[] = [
    ...domain.routes.map((route): TreeLeaf => ({
      id: `${domain.id}:route:${route.node.id}`,
      label: route.path,
      keywords: `${route.method} ${route.node.id} ${route.target ?? ""} route`,
      icon: <RouteIcon />,
      detail: <MethodChip method={route.method} className="mr-0!" />,
      href: `/routes/${encodeURIComponent(route.node.id)}`,
    })),
    ...domain.functions.map((node) =>
      leaf(
        domain.id,
        node,
        "function",
        <Braces />,
        invocationMode(node) === "event-only" ? "event-only" : "function",
        true,
      ),
    ),
    ...domain.events.map((node) => {
      const version = eventVersion(node);
      return leaf(
        domain.id,
        node,
        "event",
        <Radio />,
        version === undefined ? "event" : `event v${version}`,
        true,
      );
    }),
    ...domain.channels.map((node) =>
      leaf(domain.id, node, "channel", <RadioTower />, "channel", false),
    ),
    ...domain.errors.map((node) => {
      const status = errorStatus(node);
      return leaf(
        domain.id,
        node,
        "error",
        <AlertTriangle />,
        status === undefined ? "error" : `error ${status}`,
        false,
      );
    }),
  ];
  return {
    id: domain.id,
    label: application ? "application" : domain.id,
    icon: application ? <Network /> : <Boxes />,
    ...(application ? {} : { href: `/domains/${encodeURIComponent(domain.id)}` }),
    summary: (
      <>
        {application ? <Badge>unowned</Badge> : null}
        {countSummary(domain)}
      </>
    ),
    children: leaves,
  };
}

const PLURAL: Record<string, string> = {
  function: "functions",
  event: "events",
  channel: "channels",
  error: "errors",
};

function leaf(
  domainId: string,
  node: GraphNode,
  kind: "function" | "event" | "channel" | "error",
  icon: ReactNode,
  detail: string,
  showExposure: boolean,
): TreeLeaf {
  return {
    id: `${domainId}:${kind}:${node.id}`,
    label: kind === "error" ? node.id : nodeTitle(node),
    keywords: `${node.id} ${kind}`,
    icon,
    detail,
    ...(showExposure && node.exposure === "internal" ? { badge: <Badge>internal</Badge> } : {}),
    href: `/${PLURAL[kind]}/${encodeURIComponent(node.id)}`,
  };
}
