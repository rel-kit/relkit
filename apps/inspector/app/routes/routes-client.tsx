"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { DetailList } from "../../components/blocks/details";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface RouteItem extends ResourceTableItem {
  readonly method: string;
  readonly path: string;
  readonly target: string;
  readonly raw: boolean;
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
            <span className="inline-flex items-center whitespace-nowrap">
              <span className="route-method" data-method={item.method}>
                {item.method}
              </span>
              <code className="bg-transparent p-0 font-mono text-xs text-foreground">
                {item.path}
              </code>
            </span>
          ),
        },
        {
          key: "target",
          label: "Target",
          render: (item) =>
            item.raw ? (
              <span className="text-xs whitespace-nowrap text-muted-foreground">{item.target}</span>
            ) : (
              <code className="bg-transparent p-0 font-mono text-xs whitespace-nowrap text-muted-foreground">
                {item.target}
              </code>
            ),
        },
      ]}
      href={(item) => `/routes/${encodeURIComponent(item.id)}`}
      openLabel="Open route"
      details={(item) => (
        <DetailList
          items={[
            { label: "Route ID", value: item.id, mono: true, copy: item.id },
            {
              label: "Method",
              value: (
                <span className="route-method" data-method={item.method}>
                  {item.method}
                </span>
              ),
            },
            { label: "Path", value: item.path, mono: true, copy: item.path },
            { label: "Target", value: item.target, mono: !item.raw },
          ]}
        />
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
    raw: config?.rawHandler === true,
    target:
      config?.rawHandler === true
        ? "Raw HTTP handler"
        : text(route.targetFunctionId) || "unknown function",
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
