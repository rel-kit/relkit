"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { SourceLink } from "../source-link";

export function ErrorDetailClient() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const [detail, setDetail] = useState<InspectorObject>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (id === "") return;
    void createInspectorClient()
      .detail<InspectorObject>("errors", id)
      .then(setDetail)
      .catch(() => setError(true));
  }, [id]);
  const node = record(detail?.node) ?? record(detail?.descriptor);
  if (node === undefined) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The error API is unavailable." : "Loading error contract…"}
      </section>
    );
  }
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DOMAIN ERROR</p>
          <h1>{text(node.id)}</h1>
          <p className="lede">
            One source of truth for runtime, OpenAPI, client, and Inspector error contracts.
          </p>
        </div>
        <span className="badge">{text(node.exposure)}</span>
      </header>
      <section className="panel route-identity">
        <dl className="route-meta">
          <div>
            <dt>Domain</dt>
            <dd>{text(node.domainId)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={record(node.source)} />
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel json-panel">
        <h2>Data contract</h2>
        <pre className="safe-json">{JSON.stringify(node.data, null, 2)}</pre>
      </section>
      <section className="panel json-panel">
        <h2>Declared relationships</h2>
        <pre className="safe-json">{JSON.stringify(detail?.declaredEdges ?? [], null, 2)}</pre>
      </section>
    </div>
  );
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
