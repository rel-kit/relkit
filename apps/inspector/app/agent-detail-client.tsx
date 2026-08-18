"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../lib/api-types";
import { agentView, type AgentView } from "../lib/agents-model";
import { createInspectorClient } from "../lib/client";
import { AgentDetailView } from "./agent-detail-view";

export function AgentDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const api = useMemo(() => createInspectorClient(), []);
  const [view, setView] = useState<AgentView>();
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (id === "") return;
    const [graph, runtime] = await Promise.all([
      api.graph(),
      api.runtimeList<InspectorObject>("agents", { limit: 100 }),
    ]);
    const initial = agentView(graph, runtime.items, id);
    if (initial === undefined) throw new Error("Agent unavailable");
    const traces = await api.query<InspectorObject>("traces", {
      functionId: initial.generatedFunctionId,
      limit: 100,
    });
    const next = agentView(graph, runtime.items, id, traces.items);
    if (next === undefined) throw new Error("Agent unavailable");
    setView(next);
    setError(false);
  }, [api, id]);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  if (error || view === undefined) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The agent API is unavailable." : "Loading agent contract…"}
      </section>
    );
  }
  return <AgentDetailView view={view} />;
}
