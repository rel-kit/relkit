"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { InspectorEventRuntime, InspectorGraph } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { eventView, type EventView } from "../../lib/events-model";
import Link from "next/link";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { SourceLink } from "../source-link";
import { DetailPending, ExposureBadge, GraphAction, MetaItem } from "../domains/catalog-kit";
import { EventContract, EventFacts, eventRecord } from "./event-contract";

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
      <DetailPending
        failed={state === "error"}
        failedTitle="The event API is unavailable."
        loadingLabel="Loading event contract…"
      />
    );
  }

  const event = view.event;
  const eventId = text(event.id) || id;
  const domainId = text(event.domainId);
  const dead = view.deadLetters.length;
  return (
    <DetailLayout
      header={{
        kicker: "Event",
        title: <span className="font-mono">{eventId}</span>,
        badges: (
          <>
            <Badge>v{String(event.version ?? "?")}</Badge>
            <ExposureBadge exposure={event.exposure} />
            {dead > 0 ? <StatusBadge tone="danger" label={`${dead} dead`} /> : null}
          </>
        ),
        description:
          "Event consumers are authored event-only functions connected through exact-event triggers.",
        meta: (
          <>
            <MetaItem label="id" copy={eventId}>
              {eventId}@{String(event.version ?? "?")}
            </MetaItem>
            {domainId ? (
              <MetaItem label="domain">
                <Link
                  href={`/domains/${encodeURIComponent(domainId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {domainId}
                </Link>
              </MetaItem>
            ) : null}
            <SourceLink source={eventRecord(event.source)} />
          </>
        ),
        actions: <GraphAction id={eventId} />,
      }}
      aside={<EventFacts view={view} />}
    >
      <EventContract view={view} />
    </DetailLayout>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
