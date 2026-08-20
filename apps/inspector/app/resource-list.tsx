"use client";

import { useCallback } from "react";
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

export function ResourceList({ kind }: { readonly kind: ResourceKind }) {
  const collection = kind === "bucket" ? "buckets" : "cache";
  const label = kind === "bucket" ? "Buckets" : "Cache";
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
      return { ...nodes, items: views };
    },
    [collection, kind],
  );
  return (
    <ResourceTable
      title={label}
      description="Read-only capability, profile, policy, and operation metadata from the active graph."
      noun={label.toLowerCase()}
      load={load}
      statusOptions={states}
      columns={[
        { key: "profile", label: "Profile", render: (item) => item.profile },
        {
          key: "capabilities",
          label: "Capabilities",
          render: (item) => `${item.operations} operations · ${item.capabilities} advertised`,
        },
        { key: "state", label: "Runtime", render: (item) => item.state },
      ]}
      href={(item) => `/${collection}/${encodeURIComponent(item.id)}`}
      openLabel={`Open ${kind}`}
      details={(item) => <pre className="safe-json">{JSON.stringify(item.metadata, null, 2)}</pre>}
    />
  );
}
