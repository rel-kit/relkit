"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { unpagedQuery } from "../../lib/list-query";
import { deliveryCounts, EVENT_DELIVERY_STATES, eventViews } from "../../lib/events-model";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface EventItem extends ResourceTableItem {
  readonly version: string;
  readonly publishers: number;
  readonly listeners: number;
  readonly completed: number;
  readonly delayed: number;
  readonly deadLetters: number;
}

const statusOptions = EVENT_DELIVERY_STATES.map((id) => ({ id, label: id }));

export function EventsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<EventItem>> => {
    const api = createInspectorClient();
    const { status, ...graphQuery } = query;
    const [page, graph, runtime] = await Promise.all([
      api.list<InspectorObject>("events", graphQuery),
      api.graph(),
      api.eventRuntime({
        ...unpagedQuery(query, ["search", "status"]),
        ...(status === undefined ? {} : { state: status }),
      }),
    ]);
    const ids = new Set(page.items.map((item) => text(item.id)));
    const items = eventViews(graph, runtime).flatMap((view) => {
      const id = text(view.event.id);
      if (!ids.has(id) || (status !== undefined && view.deliveries.length === 0)) return [];
      const counts = deliveryCounts(view.deliveries);
      return [
        {
          id,
          version: typeof view.event.version === "number" ? String(view.event.version) : "unknown",
          publishers: view.publishers.length,
          listeners: view.listeners.length,
          completed: counts.completed,
          delayed: counts.delayed,
          deadLetters: counts["dead-lettered"],
        },
      ];
    });
    return { ...page, items };
  }, []);
  return (
    <ResourceTable
      title="Events"
      description="Versioned contracts, publishers, typed callback listeners, and durable delivery state."
      noun="events"
      load={load}
      statusOptions={statusOptions}
      columns={[
        { key: "version", label: "Version", render: (item) => `v${item.version}` },
        {
          key: "topology",
          label: "Topology",
          render: (item) => `${item.publishers} publishers · ${item.listeners} listeners`,
        },
        {
          key: "delivery",
          label: "Delivery",
          render: (item) =>
            `Completed ${item.completed} · Delayed ${item.delayed} · Dead ${item.deadLetters}`,
        },
      ]}
      href={(item) => `/events/${encodeURIComponent(item.id)}`}
      openLabel="Open event"
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
