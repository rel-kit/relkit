"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorGraph, InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";

export function DomainDetailClient() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const [view, setView] = useState<DomainView>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (id === "") return;
    const api = createInspectorClient();
    void Promise.all([api.detail<InspectorObject>("services", id), api.graph()])
      .then(([detail, graph]) => setView(domainView(id, detail, graph)))
      .catch(() => setError(true));
  }, [id]);
  if (view === undefined) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The domain API is unavailable." : "Loading domain metadata…"}
      </section>
    );
  }
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DOMAIN</p>
          <h1>{view.id}</h1>
          <p className="lede">
            Public and internal artifacts are grouped by compiler-owned domain identity.
          </p>
        </div>
        <span className="badge">{view.capability}</span>
      </header>
      <DomainList title="Public artifacts" items={view.publicArtifacts} />
      <DomainList title="Internal artifacts" items={view.internalArtifacts} />
      <DomainList title="Dependencies" items={view.dependencies} />
      <DomainList title="Routes" items={view.routes} />
      <section className="panel json-panel">
        <p className="eyebrow">SAFE CAPABILITY METADATA</p>
        <h2>Database or auth configuration</h2>
        <pre className="safe-json">{JSON.stringify(view.metadata, null, 2)}</pre>
      </section>
    </div>
  );
}

interface DomainView {
  readonly id: string;
  readonly capability: string;
  readonly publicArtifacts: readonly string[];
  readonly internalArtifacts: readonly string[];
  readonly dependencies: readonly string[];
  readonly routes: readonly string[];
  readonly metadata: unknown;
}

function domainView(id: string, detail: InspectorObject, payload: InspectorGraph): DomainView {
  const graph = record(payload.graph) ?? (payload as InspectorObject);
  const nodes = records(graph.nodes);
  const edges = records(graph.edges);
  const service = record(detail.node) ?? record(detail.descriptor) ?? {};
  const owned = nodes.filter((node) => node.domainId === id && node.kind !== "service");
  const functions = new Set(
    owned.filter((node) => node.kind === "function").map((node) => text(node.id)),
  );
  return {
    id,
    capability: text(record(service.capability)?.kind) || "generic",
    publicArtifacts: owned.filter((node) => node.exposure === "public").map(label),
    internalArtifacts: owned.filter((node) => node.exposure !== "public").map(label),
    dependencies: edges
      .filter((edge) => edge.from === id && edge.kind === "depends-on-service")
      .map((edge) => text(edge.to)),
    routes: edges
      .filter((edge) => edge.kind === "targets-function" && functions.has(text(edge.to)))
      .map((edge) => text(edge.from)),
    metadata: service.capability ?? {},
  };
}

function DomainList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="panel relationship-panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="badge">{items.length}</span>
      </div>
      <ul className="request-list">
        {items.map((item) => (
          <li className="request-row" key={item}>
            <code>{item}</code>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="supporting-copy">None.</p>}
    </section>
  );
}

function label(node: InspectorObject): string {
  return `${text(node.kind)} · ${text(node.id)}`;
}
function records(value: unknown): InspectorObject[] {
  return Array.isArray(value) ? value.flatMap((item) => record(item) ?? []) : [];
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
