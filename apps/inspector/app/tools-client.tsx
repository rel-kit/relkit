"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { unpagedQuery } from "../lib/list-query";
import { toolViews } from "../lib/agents-model";
import { StatusBadge } from "../components/neon/status-badge";
import { ResourceTable, type ResourceTableItem } from "./resource-table";
import { sideEffectTone } from "./tool-detail-view";

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
        {
          key: "target",
          label: "Target function",
          render: (item) => <code className="font-mono text-xs">{item.target}</code>,
        },
        {
          key: "policy",
          label: "Policy",
          render: (item) => (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <StatusBadge tone={sideEffectTone(item.sideEffect)} label={item.sideEffect} />
              <StatusBadge
                tone={item.approval === "never" || item.approval === "none" ? "neutral" : "warning"}
                label={`approval ${item.approval}`}
              />
            </span>
          ),
        },
        {
          key: "runtime",
          label: "Runtime",
          render: (item) => (
            <span className="font-mono text-xs whitespace-nowrap tabular-nums">
              {item.runtime}
              <span className="text-muted-foreground"> calls</span>
              {item.pending > 0 ? (
                <span className="text-warning"> · {item.pending} pending</span>
              ) : null}
            </span>
          ),
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
