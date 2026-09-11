"use client";

import { useCallback } from "react";
import type { InspectorObject, InspectorPage, InspectorQuery } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
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
        { key: "access", label: "Access", render: (item) => item.access },
        { key: "events", label: "Events", render: (item) => item.events },
        { key: "presence", label: "Presence", render: (item) => item.presence },
        { key: "replay", label: "Replay", render: (item) => item.replay },
      ]}
      href={(item) => `/channels/${encodeURIComponent(item.id)}`}
      openLabel="Open channel"
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
    replay: replay ? `${number(replay.retentionMs)} ms` : "live only",
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
