"use client";

import { useEffect, useState } from "react";
import type { InspectorGraph, InspectorObject, InspectorPage } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { agentViews, type AgentView } from "../lib/agents-model";

export function AgentsClient() {
  const [views, setViews] = useState<readonly AgentView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const api = createInspectorClient();
    void Promise.all([api.graph(), api.runtimeList<InspectorObject>("agents", { limit: 100 })])
      .then(([graph, runtime]: [InspectorGraph, InspectorPage<InspectorObject>]) => {
        setViews(agentViews(graph, runtime.items));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Agents</h1>
          <p className="lede">
            Bounded model profiles, inherited tool contracts, limits, and redacted invocation
            metadata.
          </p>
        </div>
        <span className="badge">{views.length} agents</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading agents…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The agents API is unavailable.
        </p>
      )}
      {state === "ready" && views.length === 0 && (
        <p className="panel route-state">No agents are reported by the active graph.</p>
      )}
      {views.length > 0 && (
        <ul className="route-list">
          {views.map((view) => (
            <li className="panel route-row" key={view.id}>
              <div>
                <strong>{view.id}</strong>
                <p className="supporting-copy">
                  Model profile: {view.modelProfile || "Unavailable"}
                </p>
              </div>
              <div className="route-row-detail">
                <span>{view.toolIds.length} allowed tools</span>
                <span>Function: {view.generatedFunctionId}</span>
              </div>
              <a className="text-link" href={`/agents/${encodeURIComponent(view.id)}`}>
                Open agent <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
