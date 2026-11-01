"use client";

import { useCallback } from "react";
import type {
  InspectorGraph,
  InspectorObject,
  InspectorPage,
  InspectorQuery,
} from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { DetailList } from "../../components/blocks/details";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface MiddlewareItem extends ResourceTableItem {
  readonly path: string;
  readonly order: number;
  readonly routes: number;
}

export function MiddlewaresClient() {
  const load = useCallback(
    async (query: InspectorQuery): Promise<InspectorPage<MiddlewareItem>> => {
      const api = createInspectorClient();
      const [page, graph] = await Promise.all([
        api.list<InspectorObject>("middlewares", query),
        api.graph(),
      ]);
      const edges = graphPart(graph, "edges");
      return {
        ...page,
        items: page.items.map((item) => ({
          id: text(item.id) || "middleware",
          path: text(item.path) || "*",
          order: number(item.order),
          routes: edges.filter((edge) => edge.kind === "uses-middleware" && edge.to === item.id)
            .length,
        })),
      };
    },
    [],
  );
  return (
    <ResourceTable
      title="Middleware"
      description="Inspect path scope, canonical execution order, and matching routes."
      noun="middleware"
      load={load}
      columns={[
        {
          key: "path",
          label: "Path",
          render: (item) => (
            <code className="bg-transparent p-0 font-mono text-xs whitespace-nowrap text-foreground">
              {item.path}
            </code>
          ),
        },
        {
          key: "order",
          label: "Order",
          render: (item) => (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {String(item.order + 1).padStart(2, "0")}
            </span>
          ),
        },
        {
          key: "routes",
          label: "Routes",
          render: (item) => (
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {item.routes} {item.routes === 1 ? "route" : "routes"}
            </span>
          ),
        },
      ]}
      href={(item) => `/middlewares/${encodeURIComponent(item.id)}`}
      openLabel="Open middleware"
      details={(item) => (
        <DetailList
          items={[
            { label: "Middleware ID", value: item.id, mono: true, copy: item.id },
            { label: "Path scope", value: item.path, mono: true },
            { label: "Execution order", value: String(item.order + 1), mono: true },
            { label: "Matching routes", value: String(item.routes), mono: true },
          ]}
        />
      )}
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** The graph payload nests nodes and edges under `graph`; older payloads keep them at the root. */
function graphPart(payload: InspectorGraph, key: "nodes" | "edges"): readonly InspectorObject[] {
  const value = payload.graph?.[key] ?? payload[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is InspectorObject =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
