"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { EventActions } from "./event-actions";
import type { ActionIdentity } from "../../lib/inspector-actions";
import { countLabel, loadDeliveryPages, mergeEventRuntime } from "../../lib/event-rows";

const PAGE_SIZE = 100;

export function EventDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [view, setView] = useState<EventView>();
  const [runtime, setRuntime] = useState<InspectorEventRuntime>();
  const [graph, setGraph] = useState<InspectorGraph>();
  const [identity, setIdentity] = useState<ActionIdentity>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  const show = useCallback(
    (nextGraph: InspectorGraph, nextRuntime: InspectorEventRuntime) => {
      const next = eventView(nextGraph, nextRuntime, id);
      if (next === undefined) throw new Error("Event unavailable");
      setGraph(nextGraph);
      setRuntime(nextRuntime);
      setView(next);
    },
    [id],
  );

  const load = useCallback(async () => {
    if (id === "") return;
    const api = createInspectorClient();
    api.invalidate(["events", "runtime"]);
    const [nextGraph, firstPage]: [InspectorGraph, InspectorEventRuntime] = await Promise.all([
      api.graph(),
      api.eventRuntime({ eventId: id, limit: PAGE_SIZE }),
    ]);
    // The API lists deliveries oldest first, so the newest are on the last page.
    const nextRuntime = await loadDeliveryPages(firstPage, (cursor) =>
      api.eventRuntime({ eventId: id, limit: PAGE_SIZE, cursor }),
    );
    show(nextGraph, nextRuntime);
    if (nextGraph.generationId !== undefined && nextGraph.graphHash !== undefined)
      setIdentity({ generationId: nextGraph.generationId, graphHash: nextGraph.graphHash });
    setState("ready");
  }, [id, show]);

  const loadMore = useCallback(async () => {
    if (graph === undefined || runtime?.nextCursor === undefined) return;
    setLoadingMore(true);
    try {
      const next = await createInspectorClient().eventRuntime({
        eventId: id,
        limit: PAGE_SIZE,
        cursor: runtime.nextCursor,
      });
      show(graph, mergeEventRuntime(runtime, next));
    } finally {
      setLoadingMore(false);
    }
  }, [graph, id, runtime, show]);

  useEffect(() => {
    void load().catch(() => setState("error"));
  }, [load]);

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
            {dead > 0 ? (
              <StatusBadge
                tone="danger"
                label={`${countLabel(dead, { hasMore: runtime?.nextCursor !== undefined })} dead`}
              />
            ) : null}
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
      <EventContract
        view={view}
        page={{
          total: runtime?.total,
          counts: runtime?.counts,
          hasMore: runtime?.nextCursor !== undefined,
        }}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore().catch(() => undefined)}
      />
      {identity === undefined ? null : (
        <EventActions
          eventId={eventId}
          {...(typeof event.version === "number" ? { eventVersion: event.version } : {})}
          schema={event.input}
          identity={identity}
          publications={view.publications}
          deliveries={view.deliveries}
          onChange={load}
        />
      )}
    </DetailLayout>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
