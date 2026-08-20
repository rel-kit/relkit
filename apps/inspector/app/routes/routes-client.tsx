"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface RouteItem extends ResourceTableItem {
  readonly method: string;
  readonly path: string;
  readonly target: string;
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((id) => ({
  id,
  label: id,
}));

export function RoutesClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<RouteItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("routes", query);
    return { ...page, items: page.items.map(routeItem) };
  }, []);
  return (
    <ResourceTable
      title="Routes"
      description="Inspect transport contracts and send a safe request to the active backend."
      noun="routes"
      load={load}
      kindOptions={methods}
      columns={[
        {
          key: "transport",
          label: "Transport",
          render: (item) => (
            <>
              <span className="route-method">{item.method}</span>
              <code>{item.path}</code>
            </>
          ),
        },
        { key: "target", label: "Target", render: (item) => item.target },
      ]}
      href={(item) => `/routes/${encodeURIComponent(item.id)}`}
      openLabel="Open route"
      details={(item) => (
        <dl className="identity-grid">
          <div>
            <dt>Method</dt>
            <dd>{item.method}</dd>
          </div>
          <div>
            <dt>Path</dt>
            <dd>{item.path}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{item.target}</dd>
          </div>
        </dl>
      )}
    />
  );
}

function routeItem(route: InspectorObject): RouteItem {
  const config = record(route.config);
  return {
    id: text(route.id) || "route",
    method: text(config?.method) || "HTTP",
    path: text(config?.path) || "/",
    target: text(route.targetFunctionId) || "unknown function",
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
