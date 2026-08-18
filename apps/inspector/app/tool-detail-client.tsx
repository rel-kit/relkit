"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { toolActionCapabilities } from "../lib/tool-actions";
import { toolView, type ToolView } from "../lib/agents-model";
import { ToolDetailView } from "./tool-detail-view";

export function ToolDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const api = useMemo(() => createInspectorClient(), []);
  const [view, setView] = useState<ToolView>();
  const [identity, setIdentity] = useState({ generationId: "", graphHash: "" });
  const [capabilities, setCapabilities] = useState<readonly string[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (id === "") return;
    const [detail, graph, runtime, advertised] = await Promise.all([
      api.detail<InspectorObject>("tools", id),
      api.graph(),
      api.runtimeList<InspectorObject>("tools", { limit: 100 }),
      toolActionCapabilities(api).catch(() => []),
    ]);
    const initial = toolView(graph, runtime.items, id);
    if (initial === undefined) throw new Error("Tool unavailable");
    const traces =
      initial.targetFunctionId === ""
        ? { items: [] as readonly InspectorObject[] }
        : await api.query<InspectorObject>("traces", {
            functionId: initial.targetFunctionId,
            limit: 100,
          });
    const next = toolView(graph, runtime.items, id, traces.items);
    if (next === undefined) throw new Error("Tool unavailable");
    setView(next);
    setIdentity({ generationId: text(detail.generationId), graphHash: text(detail.graphHash) });
    setCapabilities(advertised);
    setError(false);
  }, [api, id]);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  if (error || view === undefined) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The tool API is unavailable." : "Loading tool contract…"}
      </section>
    );
  }
  return (
    <ToolDetailView
      api={api}
      view={view}
      capabilities={capabilities}
      generationId={identity.generationId}
      graphHash={identity.graphHash}
      onComplete={load}
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
