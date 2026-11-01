"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { graphPart } from "../../lib/graph-payload";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { SourceLink } from "../source-link";
import {
  Count,
  DetailPending,
  EntityList,
  GraphAction,
  MetaItem,
  MethodChip,
} from "../domains/catalog-kit";

export function MiddlewareDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [middleware, setMiddleware] = useState<InspectorObject>();
  const [routes, setRoutes] = useState<readonly InspectorObject[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (id === "") return;
    const api = createInspectorClient();
    void Promise.all([api.detail<InspectorObject>("middlewares", id), api.graph()])
      .then(([detail, graph]) => {
        const node = record(detail.node) ?? record(detail.descriptor);
        if (node === undefined) throw new Error("Middleware unavailable");
        const routeIds = new Map(
          graphPart(graph, "edges").flatMap((edge) =>
            edge.kind === "uses-middleware" && edge.to === id
              ? [[text(edge.from), text(edge.match)] as const]
              : [],
          ),
        );
        setMiddleware(node);
        setRoutes(
          graphPart(graph, "nodes")
            .filter((candidate) => routeIds.has(text(candidate.id)))
            .map((candidate) => ({ ...candidate, match: routeIds.get(text(candidate.id)) })),
        );
      })
      .catch(() => setError(true));
  }, [id]);

  if (error || middleware === undefined) {
    return (
      <DetailPending
        failed={error}
        failedTitle="The middleware API is unavailable."
        loadingLabel="Loading middleware…"
      />
    );
  }
  const middlewareId = text(middleware.id) || id;
  const order = number(middleware.order) + 1;
  const path = text(middleware.path) || "*";
  return (
    <DetailLayout
      header={{
        kicker: "Middleware",
        title: <span className="font-mono">{middlewareId}</span>,
        badges: <Badge>order {order}</Badge>,
        description: "Path scope, execution order, and linked route coverage.",
        meta: (
          <>
            <MetaItem label="path">{path}</MetaItem>
            <SourceLink source={record(middleware.source)} />
          </>
        ),
        actions: <GraphAction id={middlewareId} />,
      }}
      aside={
        <Section id="middleware-facts" title="Middleware detail">
          <DetailList
            items={[
              { label: "Middleware ID", value: middlewareId, mono: true, copy: middlewareId },
              { label: "Path scope", value: path, mono: true, copy: path },
              { label: "Execution order", value: String(order), mono: true },
              { label: "Matching routes", value: String(routes.length), mono: true },
            ]}
          />
        </Section>
      }
    >
      <Section
        id="middleware-routes"
        title="Matching routes"
        description="Routes that run this middleware before their handler"
        actions={<Count value={routes.length} />}
        flush
      >
        <EntityList
          empty="No routes match this path."
          rows={routes.map((route) => {
            const config = record(route.config);
            const method = text(config?.method) || "HTTP";
            return {
              key: text(route.id),
              href: `/routes/${encodeURIComponent(text(route.id))}`,
              lead: <MethodChip method={method} className="mr-0!" />,
              title: text(config?.path) || text(route.id),
              detail: text(route.targetFunctionId) || undefined,
              trailing: text(route.match) ? <Badge>{text(route.match)}</Badge> : undefined,
            };
          })}
        />
      </Section>
    </DetailLayout>
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
function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
