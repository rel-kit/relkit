"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { unpagedQuery } from "../lib/list-query";
import { agentViews } from "../lib/agents-model";
import { StatusBadge } from "../components/neon/status-badge";
import { ResourceTable, type ResourceTableItem } from "./resource-table";

interface AgentItem extends ResourceTableItem {
  readonly model: string;
  readonly client: string;
  readonly chat: boolean;
  readonly tools: number;
  readonly generatedFunction: string;
  readonly invocations: number;
}

const statuses = ["running", "completed", "failed", "cancelled"].map((id) => ({ id, label: id }));

export function AgentsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<AgentItem>> => {
    const api = createInspectorClient();
    const { status, ...graphQuery } = query;
    const [page, graph, runtime] = await Promise.all([
      api.list<InspectorObject>("agents", graphQuery),
      api.graph(),
      api.runtimeList<InspectorObject>("agents", unpagedQuery(query)),
    ]);
    const ids = new Set(page.items.map((item) => text(item.id)));
    const items = agentViews(graph, runtime.items).flatMap((view) =>
      ids.has(view.id) && (status === undefined || view.runtime.length > 0)
        ? [
            {
              id: view.id,
              model: view.model || "unavailable",
              client: view.client,
              chat: view.chat,
              tools: view.toolIds.length,
              generatedFunction: view.generatedFunctionId,
              invocations: view.runtime.length,
            },
          ]
        : [],
    );
    return { ...page, items };
  }, []);
  return (
    <ResourceTable
      title="Agents"
      description="Bounded model selection, inherited tool contracts, limits, and redacted invocation metadata."
      noun="agents"
      load={load}
      statusOptions={statuses}
      columns={[
        {
          key: "model",
          label: "Model",
          render: (item) => <code className="font-mono text-xs">{item.model}</code>,
        },
        {
          key: "client",
          label: "Client",
          render: (item) => (
            <StatusBadge
              tone={item.client === "internal" ? "neutral" : "info"}
              label={item.chat ? `${item.client} · chat` : item.client}
            />
          ),
        },
        {
          key: "tools",
          label: "Tools",
          render: (item) => (
            <span className="font-mono text-xs tabular-nums">
              {item.tools}
              <span className="text-muted-foreground"> allowed</span>
            </span>
          ),
        },
        {
          key: "runtime",
          label: "Runtime",
          render: (item) => (
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-xs tabular-nums">
                {item.invocations}
                <span className="text-muted-foreground"> invocations</span>
              </span>
              <code
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={item.generatedFunction}
              >
                {item.generatedFunction}
              </code>
            </span>
          ),
        },
      ]}
      href={(item) => `/agents/${encodeURIComponent(item.id)}`}
      openLabel="Open agent"
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
