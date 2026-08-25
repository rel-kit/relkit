"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { SourceLink } from "../source-link";

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
          (graph.edges ?? []).flatMap((edge) =>
            edge.kind === "uses-middleware" && edge.to === id
              ? [[text(edge.from), text(edge.match)] as const]
              : [],
          ),
        );
        setMiddleware(node);
        setRoutes(
          (graph.nodes ?? [])
            .filter((candidate) => routeIds.has(text(candidate.id)))
            .map((candidate) => ({ ...candidate, match: routeIds.get(text(candidate.id)) })),
        );
      })
      .catch(() => setError(true));
  }, [id]);

  if (error || middleware === undefined) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The middleware API is unavailable." : "Loading middleware…"}
      </section>
    );
  }
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">HTTP MIDDLEWARE</p>
          <h1>{text(middleware.id) || id}</h1>
          <p className="lede">Path scope, execution order, and linked route coverage.</p>
        </div>
        <span className="badge">Order {number(middleware.order) + 1}</span>
      </header>
      <section className="panel">
        <dl className="route-meta">
          <div>
            <dt>Path</dt>
            <dd>
              <code>{text(middleware.path) || "*"}</code>
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={record(middleware.source)} />
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Matching routes</h2>
          <span className="badge">{routes.length}</span>
        </div>
        {routes.length === 0 ? (
          <p className="supporting-copy">No routes match this path.</p>
        ) : (
          <ul className="request-list">
            {routes.map((route) => {
              const config = record(route.config);
              return (
                <li className="request-row" key={text(route.id)}>
                  <a className="text-link" href={`/routes/${encodeURIComponent(text(route.id))}`}>
                    {text(config?.method)} {text(config?.path)}
                  </a>
                  <span className="badge">{text(route.match)}</span>
                </li>
              );
            })}
          </ul>
        )}
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
function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
