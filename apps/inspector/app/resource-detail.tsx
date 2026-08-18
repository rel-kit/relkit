"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject, InspectorPage } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { resourceView, type ResourceKind, type ResourceView } from "../lib/resources-model";
import { ResourceDetailView } from "./resource-detail-view";

export function ResourceDetail({ kind }: { readonly kind: ResourceKind }) {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [view, setView] = useState<ResourceView>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (id === "") return;
    const api = createInspectorClient();
    void Promise.all([
      api.detail<InspectorObject>(kind, id),
      api.runtimeList<InspectorObject>(kind, { limit: 100 }),
    ])
      .then(([detail, runtime]: [InspectorObject, InspectorPage<InspectorObject>]) => {
        const node = record(detail.node) ?? record(detail.descriptor) ?? record(detail);
        if (node === undefined) throw new Error("Resource unavailable");
        const runtimeItem = runtime.items.find((item) => resourceId(kind, item) === id);
        setView(resourceView(kind, node, runtimeItem));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id, kind]);

  const label = kind === "bucket" ? "Bucket" : "Cache";
  if (state !== "ready" || view === undefined) {
    return (
      <section className="panel route-state" role={state === "error" ? "alert" : "status"}>
        {state === "error"
          ? `The ${label.toLowerCase()} API is unavailable.`
          : `Loading ${label.toLowerCase()} metadata…`}
      </section>
    );
  }

  return <ResourceDetailView view={view} />;
}

function resourceId(kind: ResourceKind, value: InspectorObject): string {
  const key = kind === "bucket" ? "bucketId" : "cacheId";
  return text(value[key]) || text(value.id);
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
