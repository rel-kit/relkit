"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { InspectorEventRuntime, InspectorGraph } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { eventView, type EventView } from "../../lib/events-model";
import { EventContract } from "./event-contract";

export function EventDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [view, setView] = useState<EventView>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (id === "") return;
    const api = createInspectorClient();
    void Promise.all([api.graph(), api.eventRuntime({ eventId: id, limit: 100 })])
      .then(([graph, runtime]: [InspectorGraph, InspectorEventRuntime]) => {
        const next = eventView(graph, runtime, id);
        if (next === undefined) throw new Error("Event unavailable");
        setView(next);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  if (state !== "ready" || view === undefined) {
    return (
      <section className="panel route-state" role={state === "error" ? "alert" : "status"}>
        {state === "error" ? "The event API is unavailable." : "Loading event contract…"}
      </section>
    );
  }

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Event detail</h1>
          <p className="lede">
            Event consumers are authored event-only functions connected through exact-event
            triggers.
          </p>
        </div>
        <span className="badge">
          {text(view.event.id)}@{String(view.event.version ?? "?")}
        </span>
      </header>
      <EventContract view={view} />
    </div>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
