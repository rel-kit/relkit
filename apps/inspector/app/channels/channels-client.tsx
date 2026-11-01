"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { DetailList } from "../../components/blocks/details";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { ResourceTable, type ResourceTableItem } from "../resource-table";

interface ChannelItem extends ResourceTableItem {
  readonly access: string;
  readonly events: number;
  readonly presence: string;
  readonly replay: string;
}

export function ChannelsClient() {
  const load = useCallback(async (query: InspectorQuery): Promise<InspectorPage<ChannelItem>> => {
    const page = await createInspectorClient().list<InspectorObject>("channels", query);
    return { ...page, items: page.items.map(channelItem) };
  }, []);
  return (
    <ResourceTable
      title="Channels"
      description="Realtime event contracts, client access, replay, and presence declarations."
      noun="channels"
      load={load}
      columns={[
        {
          key: "access",
          label: "Access",
          render: (item) => (
            <Badge
              variant={
                item.access === "public"
                  ? "info"
                  : item.access === "protected"
                    ? "warning"
                    : "default"
              }
            >
              {item.access}
            </Badge>
          ),
        },
        {
          key: "events",
          label: "Events",
          render: (item) => (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {item.events}
            </span>
          ),
        },
        {
          key: "presence",
          label: "Presence",
          render: (item) => (
            <StatusBadge
              tone={item.presence === "none" ? "neutral" : "info"}
              label={item.presence}
            />
          ),
        },
        {
          key: "replay",
          label: "Replay",
          render: (item) => (
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {item.replay}
            </span>
          ),
        },
      ]}
      href={(item) => `/channels/${encodeURIComponent(item.id)}`}
      openLabel="Open channel"
      details={(item) => (
        <DetailList
          columns={2}
          items={[
            { label: "Channel ID", value: item.id, mono: true, copy: item.id },
            { label: "Access", value: item.access, mono: true },
            { label: "Events", value: String(item.events), mono: true },
            { label: "Presence", value: item.presence, mono: true },
            { label: "Replay", value: item.replay, mono: true },
          ]}
        />
      )}
    />
  );
}

function channelItem(value: InspectorObject): ChannelItem {
  const events = record(value.events);
  const replay = record(value.replay);
  return {
    id: text(value.id) || "channel",
    access: text(value.client) || "internal",
    events: Object.keys(events ?? {}).length,
    presence: value.presence === "count" ? "count" : record(value.presence) ? "members" : "none",
    replay: replay ? `${number(replay.retentionMs).toLocaleString("en-US")} ms` : "live only",
  };
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
