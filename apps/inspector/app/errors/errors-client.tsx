"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface ErrorItem extends ResourceTableItem {
  readonly domain: string;
  readonly exposure: string;
  readonly status: string;
  readonly retry: string;
}

export function ErrorsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<ErrorItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("errors", query);
    return { ...page, items: page.items.map(errorItem) };
  }, []);
  return (
    <ResourceTable
      title="Errors"
      description="Inspect domain errors and the public contracts that declare them."
      noun="errors"
      load={load}
      columns={[
        { key: "domain", label: "Domain", render: (item) => item.domain },
        { key: "exposure", label: "Exposure", render: (item) => item.exposure },
        { key: "status", label: "HTTP", render: (item) => item.status },
        { key: "retry", label: "Retry", render: (item) => item.retry },
      ]}
      href={(item) => `/errors/${encodeURIComponent(item.id)}`}
      openLabel="Open error"
    />
  );
}

function errorItem(item: InspectorObject): ErrorItem {
  const http = record(item.http);
  return {
    id: text(item.id) || "error",
    domain: text(item.domainId) || "unowned",
    exposure: text(item.exposure) || "internal",
    status: typeof http?.status === "number" ? String(http.status) : "default",
    retry: text(item.retry) || "never",
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
