"use client";

import { useEffect, useState } from "react";
import type { InspectorGraph, InspectorObject, InspectorPage } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { toolViews, type ToolView } from "../lib/agents-model";

export function ToolsClient() {
  const [views, setViews] = useState<readonly ToolView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const api = createInspectorClient();
    void Promise.all([api.graph(), api.runtimeList<InspectorObject>("tools", { limit: 100 })])
      .then(([graph, runtime]: [InspectorGraph, InspectorPage<InspectorObject>]) => {
        setViews(toolViews(graph, runtime.items));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Tools</h1>
          <p className="lede">
            Function-backed contracts with inherited schemas, side-effect policy, and safe runtime
            state.
          </p>
        </div>
        <span className="badge">{views.length} tools</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading tools…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The tools API is unavailable.
        </p>
      )}
      {state === "ready" && views.length === 0 && (
        <p className="panel route-state">No tools are reported by the active graph.</p>
      )}
      {views.length > 0 && (
        <ul className="route-list">
          {views.map((view) => (
            <li className="panel route-row" key={view.id}>
              <div>
                <strong>{view.id}</strong>
                <p className="supporting-copy">Target: {view.targetFunctionId || "Unavailable"}</p>
              </div>
              <div className="route-row-detail">
                <span>Side effect: {view.sideEffect}</span>
                <span>Approval: {view.approvalPolicy}</span>
                {view.pendingApprovals.length > 0 && (
                  <span>{view.pendingApprovals.length} pending</span>
                )}
              </div>
              <a className="text-link" href={`/tools/${encodeURIComponent(view.id)}`}>
                Open tool <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
