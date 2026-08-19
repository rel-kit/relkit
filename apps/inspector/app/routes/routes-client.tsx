"use client";

import { useEffect, useState } from "react";
import { createInspectorClient } from "../../lib/client";
import type { InspectorPage, InspectorObject } from "../../lib/api-types";

export function RoutesClient() {
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    void createInspectorClient()
      .list<InspectorObject>("routes", { limit: 100 })
      .then((payload: InspectorPage<InspectorObject>) => {
        setItems(payload.items);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Routes</h1>
          <p className="lede">
            Inspect transport contracts and send a safe request to the active backend.
          </p>
        </div>
        <span className="badge">{items.length} routes</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading route contracts…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The route API is unavailable.
        </p>
      )}
      {state === "ready" && items.length === 0 && (
        <p className="panel route-state">No HTTP routes are reported by the active graph.</p>
      )}
      {items.length > 0 && (
        <ul className="route-list">
          {items.map((route) => (
            <RouteRow key={text(route.id)} route={route} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteRow({ route }: { readonly route: InspectorObject }) {
  const config = record(route.config);
  const id = text(route.id) ?? "route";
  const method = text(config?.method) ?? "HTTP";
  const path = text(config?.path) ?? "/";
  const target = text(route.targetFunctionId) ?? "unknown function";
  return (
    <li className="panel route-row">
      <div>
        <span className="route-method">{method}</span>
        <code>{path}</code>
      </div>
      <div className="route-row-detail">
        <strong>{id}</strong>
        <span>→ {target}</span>
      </div>
      <a className="text-link" href={`/routes/${encodeURIComponent(id)}`}>
        Open route <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value : "";
}
