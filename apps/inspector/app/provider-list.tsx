"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { ResourceTable, type ResourceTableItem } from "./resource-table";

interface ProviderItem extends ResourceTableItem {
  readonly capability: string;
  readonly profile: string;
  readonly adapter: string;
  readonly ownership: string;
  readonly references: number;
  readonly metadata: InspectorObject;
}

export function ProviderList() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<ProviderItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("providers", query);
    return {
      ...page,
      items: page.items.map(providerItem),
    };
  }, []);
  return (
    <ResourceTable
      title="Providers"
      description="Capability bindings from the active graph, without connection values or secrets."
      noun="providers"
      load={load}
      columns={[
        { key: "capability", label: "Capability", render: (item) => item.capability },
        { key: "profile", label: "Profile", render: (item) => item.profile },
        { key: "adapter", label: "Adapter", render: (item) => item.adapter },
        { key: "ownership", label: "Ownership", render: (item) => item.ownership },
        { key: "references", label: "Environment", render: (item) => item.references },
      ]}
      href={(item) => `/providers/${encodeURIComponent(item.id)}`}
      openLabel="Open provider"
      details={(item) => <pre className="safe-json">{JSON.stringify(item.metadata, null, 2)}</pre>}
    />
  );
}

function providerItem(value: InspectorObject): ProviderItem {
  return {
    id: text(value.id),
    capability: text(value.capability),
    profile: text(value.profile),
    adapter: text(value.adapter),
    ownership: text(value.ownership),
    references: Array.isArray(value.environment) ? value.environment.length : 0,
    metadata: value,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "Unavailable";
}
