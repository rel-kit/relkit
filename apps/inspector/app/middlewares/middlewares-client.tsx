"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
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
      const edges = graph.edges ?? [];
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
        { key: "path", label: "Path", render: (item) => <code>{item.path}</code> },
        { key: "order", label: "Order", render: (item) => item.order + 1 },
        { key: "routes", label: "Routes", render: (item) => item.routes },
      ]}
      href={(item) => `/middlewares/${encodeURIComponent(item.id)}`}
      openLabel="Open middleware"
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
