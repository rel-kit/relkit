"use client";

import { useEffect, useState } from "react";
import type { InspectorObject, InspectorPage } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { resourceViews, type ResourceKind, type ResourceView } from "../lib/resources-model";

export function ResourceList({ kind }: { readonly kind: ResourceKind }) {
  const [views, setViews] = useState<readonly ResourceView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const api = createInspectorClient();
    const collection = kind === "bucket" ? "buckets" : "cache";
    void Promise.all([
      api.list<InspectorObject>(collection, { limit: 100 }),
      api.runtimeList<InspectorObject>(collection, { limit: 100 }),
    ])
      .then(
        ([nodes, runtime]: [InspectorPage<InspectorObject>, InspectorPage<InspectorObject>]) => {
          setViews(resourceViews(kind, nodes.items, runtime.items));
          setState("ready");
        },
      )
      .catch(() => setState("error"));
  }, [kind]);

  const label = kind === "bucket" ? "Buckets" : "Cache";
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>{label}</h1>
          <p className="lede">
            Read-only capability, profile, policy, and operation metadata from the active graph.
          </p>
        </div>
        <span className="badge">
          {views.length} {kind === "bucket" ? "buckets" : "caches"}
        </span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading {label.toLowerCase()}…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The {label.toLowerCase()} API is unavailable.
        </p>
      )}
      {state === "ready" && views.length === 0 && (
        <p className="panel route-state">
          No {label.toLowerCase()} are reported by the active graph.
        </p>
      )}
      {views.length > 0 && (
        <ul className="route-list">
          {views.map((view) => (
            <ResourceRow key={view.id} view={view} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceRow({ view }: { readonly view: ResourceView }) {
  const operationCount = view.operations.filter(
    (operation) => operation.status !== "unsupported",
  ).length;
  return (
    <li className="panel route-row">
      <div>
        <strong>{view.id}</strong>
        <p className="supporting-copy">Profile: {view.profile}</p>
      </div>
      <div className="route-row-detail">
        <span>{operationCount} declared operations</span>
        <span>{view.capabilities.length} advertised capabilities</span>
        {view.runtimeState !== undefined && <span>State: {view.runtimeState}</span>}
      </div>
      <a
        className="text-link"
        href={`/${view.kind === "bucket" ? "buckets" : "cache"}/${encodeURIComponent(view.id)}`}
      >
        Open {view.kind} <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}
