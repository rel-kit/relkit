"use client";

import { useEffect, useState } from "react";
import type { InspectorEventRuntime, InspectorGraph, InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { deliveryCounts, eventViews, type EventView } from "../../lib/events-model";

export function EventsClient() {
  const [views, setViews] = useState<readonly EventView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const api = createInspectorClient();
    void Promise.all([
      api.graph(),
      api.runtimeList<InspectorEventRuntime>("events", { limit: 100 }),
    ])
      .then(([graph, runtime]: [InspectorGraph, InspectorEventRuntime]) => {
        setViews(eventViews(graph, runtime));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Events</h1>
          <p className="lede">
            Versioned event contracts, publishers, and listeners targeting functions.
          </p>
        </div>
        <span className="badge">{views.length} events</span>
      </header>
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading events…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The events API is unavailable.
        </p>
      )}
      {state === "ready" && views.length === 0 && (
        <p className="panel route-state">No event contracts are reported by the active graph.</p>
      )}
      {views.length > 0 && (
        <ul className="route-list">
          {views.map((view) => (
            <EventRow key={text(view.event.id)} view={view} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({ view }: { readonly view: EventView }) {
  const id = text(view.event.id);
  const counts = deliveryCounts(view.deliveries);
  return (
    <li className="panel route-row">
      <div>
        <strong>
          {id}@{version(view.event.version)}
        </strong>
        <p className="supporting-copy">
          {view.publishers.length} publisher(s) · {view.listeners.length} listener(s)
        </p>
      </div>
      <div className="route-row-detail">
        <span>Completed {counts.completed}</span>
        <span>Delayed {counts.delayed}</span>
        <span>Dead letters {counts["dead-lettered"]}</span>
      </div>
      <a className="text-link" href={`/events/${encodeURIComponent(id)}`}>
        Open event <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function version(value: unknown): string {
  return typeof value === "number" ? String(value) : "unknown";
}
