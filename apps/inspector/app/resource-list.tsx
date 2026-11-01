"use client";

import { Database, HardDrive, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { CodeBlock } from "../components/blocks/code-block";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Button } from "../components/ui/button";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { unpagedQuery } from "../lib/list-query";
import { resourceViews, type ResourceKind } from "../lib/resources-model";
import { ResourceTable, type ResourceTableItem } from "./resource-table";

interface ResourceItem extends ResourceTableItem {
  readonly profile: string;
  readonly operations: number;
  readonly capabilities: number;
  readonly state: string;
  readonly metadata: unknown;
}

const states = ["ready", "degraded", "unavailable"].map((id) => ({ id, label: id }));

const DESCRIPTION =
  "Read-only capability, profile, policy, and operation metadata from the active graph.";

export function ResourceList({ kind }: { readonly kind: ResourceKind }) {
  const collection = kind === "bucket" ? "buckets" : "cache";
  const label = kind === "bucket" ? "Buckets" : "Cache";
  /* An unfiltered first page with nothing in it means the app declares none of this resource. */
  const [undeclared, setUndeclared] = useState(false);
  const load = useCallback(
    async (query: InspectorQuery): Promise<InspectorPage<ResourceItem>> => {
      const api = createInspectorClient();
      const { status, ...graphQuery } = query;
      const [nodes, runtime] = await Promise.all([
        api.list<InspectorObject>(collection, graphQuery),
        api.runtimeList<InspectorObject>(collection, unpagedQuery(query)),
      ]);
      const views = resourceViews(kind, nodes.items, runtime.items)
        .filter((view) => status === undefined || view.runtimeState !== undefined)
        .map((view) => ({
          id: view.id,
          profile: view.profile,
          operations: view.operations.filter((operation) => operation.status !== "unsupported")
            .length,
          capabilities: view.capabilities.length,
          state: view.runtimeState ?? "not reported",
          metadata: view,
        }));
      const unfiltered =
        query.cursor === undefined &&
        status === undefined &&
        query.search === undefined &&
        (query as Readonly<Record<string, unknown>>).domain === undefined &&
        (query as Readonly<Record<string, unknown>>).layer === undefined;
      if (unfiltered && nodes.items.length === 0) setUndeclared(true);
      return { ...nodes, items: views };
    },
    [collection, kind],
  );

  if (undeclared)
    return (
      <div className="route-page resource-table-page">
        <PageHeader
          title={label}
          description={DESCRIPTION}
          actions={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Refresh ${label.toLowerCase()}`}
              onPress={() => setUndeclared(false)}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          }
        />
        <EmptyState
          size="lg"
          icon={kind === "bucket" ? <HardDrive /> : <Database />}
          title={
            kind === "bucket"
              ? "This application declares no buckets."
              : "This application declares no caches."
          }
          description={
            kind === "bucket"
              ? "Declare a bucket resource to store objects; its policy, provider operations and a read-only object browser appear here."
              : "Declare a cache resource to keep keyed values with a TTL; its schemas, TTL policy and a read-only key browser appear here."
          }
          action={
            <code className="rounded-md border border-border bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
              {kind === "bucket" ? "defineBucket({ id, … })" : "defineCache({ id, … })"}
            </code>
          }
        />
      </div>
    );

  return (
    <ResourceTable
      title={label}
      description={DESCRIPTION}
      noun={label.toLowerCase()}
      load={load}
      statusOptions={states}
      columns={[
        {
          key: "profile",
          label: "Profile",
          render: (item) => <code className="font-mono text-xs">{item.profile}</code>,
        },
        {
          key: "capabilities",
          label: "Operations",
          render: (item) => (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              <span className="text-foreground">{item.operations}</span> ops ·{" "}
              <span className="text-foreground">{item.capabilities}</span> advertised
            </span>
          ),
        },
        {
          key: "state",
          label: "Runtime",
          render: (item) => <StatusBadge tone={statusTone(item.state)} label={item.state} />,
        },
      ]}
      href={(item) => `/${collection}/${encodeURIComponent(item.id)}`}
      openLabel={`Open ${kind}`}
      details={(item) => (
        <CodeBlock value={item.metadata} label={`${kind} metadata`} maxHeight="60vh" />
      )}
    />
  );
}
