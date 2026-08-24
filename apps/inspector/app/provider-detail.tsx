"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { SourceLink } from "./source-link";

export function ProviderDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [node, setNode] = useState<InspectorObject>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === "") return;
    void createInspectorClient()
      .detail<InspectorObject>("providers", id)
      .then((detail) => setNode(record(detail.node) ?? record(detail.descriptor)))
      .catch(() => setFailed(true));
  }, [id]);
  if (node === undefined) {
    return (
      <section className="panel route-state">
        {failed ? "Provider unavailable." : "Loading provider…"}
      </section>
    );
  }
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Provider binding</h1>
        </div>
        <span className="badge">{text(node.id)}</span>
      </header>
      <section className="panel">
        <dl className="route-meta">
          <Meta label="Capability" value={text(node.capability)} />
          <Meta label="Profile" value={text(node.profile)} />
          <Meta label="Adapter" value={text(node.adapter)} />
          <Meta label="Ownership" value={text(node.ownership)} />
          <Meta label="Source" value={<SourceLink source={record(node.source)} />} />
        </dl>
      </section>
      <section className="panel json-panel">
        <p className="eyebrow">VALUE-FREE CONFIGURATION</p>
        <pre className="safe-json">{JSON.stringify(node.configuration ?? {}, null, 2)}</pre>
      </section>
    </div>
  );
}

function Meta({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "Unavailable";
}
