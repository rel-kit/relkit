"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { unpagedQuery } from "../lib/list-query";
import { agentViews } from "../lib/agents-model";
import { ResourceTable, type ResourceTableItem } from "./resource-table";

interface AgentItem extends ResourceTableItem {
  readonly model: string;
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
        { key: "model", label: "Model", render: (item) => item.model },
        { key: "tools", label: "Allowed tools", render: (item) => item.tools },
        {
          key: "runtime",
          label: "Runtime",
          render: (item) => `${item.invocations} invocations · ${item.generatedFunction}`,
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
