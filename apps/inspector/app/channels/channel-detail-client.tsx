"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { SchemaPanel } from "../schema-panel";
import { SourceLink } from "../source-link";
import { ChannelLiveConsole } from "./channel-live-console";

export function ChannelDetailClient() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const [channel, setChannel] = useState<InspectorObject>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!id) return;
    void createInspectorClient()
      .detail<InspectorObject>("channels", id)
      .then((detail) => {
        const node = record(detail.node) ?? record(detail.descriptor);
        if (!node) throw new Error("Channel unavailable");
        setChannel(node);
      })
      .catch(() => setError(true));
  }, [id]);
  if (error || !channel) {
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The channel API is unavailable." : "Loading channel…"}
      </section>
    );
  }
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">REALTIME CHANNEL</p>
          <h1>{text(channel.id) || id}</h1>
          <p className="lede">Typed event, replay, presence, and exposure metadata.</p>
        </div>
        <span className="badge">{text(channel.client) || "internal"}</span>
      </header>
      <section className="panel">
        <dl className="route-meta">
          <Meta label="Profile" value={text(channel.profile) || "default"} />
          <Meta label="Presence" value={presence(channel.presence)} />
          <Meta label="Source" value={<SourceLink source={record(channel.source)} />} />
        </dl>
      </section>
      <div className="route-contract-grid">
        <SchemaPanel eyebrow="VALIDATED INPUT" title="Partition params" value={channel.params} />
        <SchemaPanel eyebrow="PUBLIC EVENTS" title="Event schemas" value={channel.events} />
      </div>
      <SchemaPanel eyebrow="RECOVERY POLICY" title="Replay" value={channel.replay ?? null} />
      <ChannelLiveConsole channel={channel} />
    </div>
  );
}

function Meta({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function presence(value: unknown): string {
  return value === "count" ? "Connection count" : record(value) ? "Typed members" : "Disabled";
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
