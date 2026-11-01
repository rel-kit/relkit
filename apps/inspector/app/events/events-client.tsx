"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { unpagedQuery } from "../../lib/list-query";
import { deliveryCounts, EVENT_DELIVERY_STATES, eventViews } from "../../lib/events-model";
import { DetailList } from "../../components/blocks/details";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { plural } from "../domains/catalog-kit";
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
        {
          key: "version",
          label: "Version",
          render: (item) => <Badge>v{item.version}</Badge>,
        },
        {
          key: "topology",
          label: "Topology",
          render: (item) => (
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {plural(item.publishers, "publisher")} · {plural(item.listeners, "listener")}
            </span>
          ),
        },
        {
          key: "delivery",
          label: "Delivery",
          render: (item) => (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <StatusBadge
                tone={item.completed > 0 ? "success" : "neutral"}
                label={`Completed ${item.completed}`}
              />
              <StatusBadge
                tone={item.delayed > 0 ? "warning" : "neutral"}
                label={`Delayed ${item.delayed}`}
              />
              <StatusBadge
                tone={item.deadLetters > 0 ? "danger" : "neutral"}
                label={`Dead ${item.deadLetters}`}
              />
            </span>
          ),
        },
      ]}
      href={(item) => `/events/${encodeURIComponent(item.id)}`}
      openLabel="Open event"
      details={(item) => (
        <DetailList
          columns={2}
          items={[
            { label: "Event ID", value: item.id, mono: true, copy: item.id },
            { label: "Version", value: `v${item.version}`, mono: true },
            { label: "Publishers", value: String(item.publishers), mono: true },
            { label: "Listeners", value: String(item.listeners), mono: true },
            { label: "Completed", value: String(item.completed), mono: true },
            { label: "Delayed", value: String(item.delayed), mono: true },
            { label: "Dead letters", value: String(item.deadLetters), mono: true },
          ]}
        />
      )}
    />
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
