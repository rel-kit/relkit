"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface DomainItem extends ResourceTableItem {
  readonly functions: number;
  readonly events: number;
  readonly capability: string;
}

export function DomainsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<DomainItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("services", query);
    return { ...page, items: page.items.map(domainItem) };
  }, []);
  return (
    <ResourceTable
      title="Domains"
      description="Inspect each domain facade, its public surface, dependencies, routes, and specialized capabilities."
      noun="domains"
      load={load}
      columns={[
        { key: "functions", label: "Public functions", render: (item) => item.functions },
        { key: "events", label: "Public events", render: (item) => item.events },
        { key: "capability", label: "Capability", render: (item) => item.capability },
      ]}
      href={(item) => `/domains/${encodeURIComponent(item.id)}`}
      openLabel="Open domain"
    />
  );
}

function domainItem(item: InspectorObject): DomainItem {
  const capability = record(item.capability);
  return {
    id: text(item.id) || "domain",
    functions: Array.isArray(item.functions) ? item.functions.length : 0,
    events: Array.isArray(item.events) ? item.events.length : 0,
    capability: text(capability?.kind) || "generic",
  };
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
