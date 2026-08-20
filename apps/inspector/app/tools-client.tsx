"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { unpagedQuery } from "../lib/list-query";
import { toolViews } from "../lib/agents-model";
import { ResourceTable, type ResourceTableItem } from "./resource-table";

interface ToolItem extends ResourceTableItem {
  readonly target: string;
  readonly sideEffect: string;
  readonly approval: string;
  readonly pending: number;
  readonly runtime: number;
}

const statuses = ["pending", "running", "completed", "failed"].map((id) => ({ id, label: id }));

export function ToolsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<ToolItem>> => {
    const api = createInspectorClient();
    const { status, ...graphQuery } = query;
    const [page, graph, runtime] = await Promise.all([
      api.list<InspectorObject>("tools", graphQuery),
      api.graph(),
      api.runtimeList<InspectorObject>("tools", unpagedQuery(query)),
    ]);
    const ids = new Set(page.items.map((item) => text(item.id)));
    const items = toolViews(graph, runtime.items).flatMap((view) =>
      ids.has(view.id) && (status === undefined || view.runtime.length > 0)
        ? [
            {
              id: view.id,
              target: view.targetFunctionId || "unavailable",
              sideEffect: view.sideEffect,
              approval: view.approvalPolicy,
              pending: view.pendingApprovals.length,
              runtime: view.runtime.length,
            },
          ]
        : [],
    );
    return { ...page, items };
  }, []);
  return (
    <ResourceTable
      title="Tools"
      description="Function-backed contracts with side-effect policy, approval controls, and safe runtime state."
      noun="tools"
      load={load}
      statusOptions={statuses}
      columns={[
        { key: "target", label: "Target", render: (item) => item.target },
        {
          key: "policy",
          label: "Policy",
          render: (item) => `${item.sideEffect} · ${item.approval}`,
        },
        {
          key: "runtime",
          label: "Runtime",
          render: (item) => `${item.runtime} calls · ${item.pending} pending`,
        },
      ]}
      href={(item) => `/tools/${encodeURIComponent(item.id)}`}
      openLabel="Open tool"
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
