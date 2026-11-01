"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { DetailList } from "../../components/blocks/details";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
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
        {
          key: "domain",
          label: "Domain",
          render: (item) => (
            <code className="bg-transparent p-0 font-mono text-xs whitespace-nowrap text-muted-foreground">
              {item.domain}
            </code>
          ),
        },
        {
          key: "exposure",
          label: "Exposure",
          render: (item) => (
            <Badge variant={item.exposure === "public" ? "info" : "default"}>{item.exposure}</Badge>
          ),
        },
        {
          key: "status",
          label: "HTTP",
          render: (item) => (
            <StatusBadge
              tone={
                item.status === "default"
                  ? "neutral"
                  : Number(item.status) >= 500
                    ? "danger"
                    : "warning"
              }
              label={item.status}
            />
          ),
        },
        {
          key: "retry",
          label: "Retry",
          render: (item) => (
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
              {item.retry}
            </span>
          ),
        },
      ]}
      href={(item) => `/errors/${encodeURIComponent(item.id)}`}
      openLabel="Open error"
      details={(item) => (
        <DetailList
          columns={2}
          items={[
            { label: "Error ID", value: item.id, mono: true, copy: item.id },
            { label: "Domain", value: item.domain, mono: true },
            { label: "Exposure", value: item.exposure, mono: true },
            { label: "HTTP status", value: item.status, mono: true },
            { label: "Retry", value: item.retry, mono: true },
          ]}
        />
      )}
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
