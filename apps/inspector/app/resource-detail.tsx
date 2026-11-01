"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject, InspectorPage } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { resourceView, type ResourceKind, type ResourceView } from "../lib/resources-model";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { ResourceDetailView } from "./resource-detail-view";

export function ResourceDetail({ kind }: { readonly kind: ResourceKind }) {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [view, setView] = useState<ResourceView>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (id === "") return;
    const api = createInspectorClient();
    const collection = kind === "bucket" ? "buckets" : "cache";
    void Promise.all([
      api.detail<InspectorObject>(collection, id),
      api.runtimeList<InspectorObject>(collection, { limit: 100 }),
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
    return state === "error" ? (
      <div className="route-page">
        <FailedState
          title={`The ${label.toLowerCase()} API is unavailable.`}
          description={`“${id}” could not be read from the active generation.`}
        />
      </div>
    ) : (
      <div className="route-page rounded-lg border border-border bg-card">
        <LoadingRows label={`Loading ${label.toLowerCase()} metadata…`} rows={6} />
      </div>
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
