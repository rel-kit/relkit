"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { SchemaPanel } from "../schema-panel";
import { SourceLink } from "../source-link";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { DetailPending, GraphAction, MetaItem } from "../domains/catalog-kit";
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
      <DetailPending
        failed={error}
        failedTitle="The channel API is unavailable."
        loadingLabel="Loading channel…"
      />
    );
  }
  const channelId = text(channel.id) || id;
  const access = text(channel.client) || "internal";
  const domainId = text(channel.domainId);
  const replay = record(channel.replay);
  const events = Object.keys(record(channel.events) ?? {});
  return (
    <DetailLayout
      header={{
        kicker: "Channel",
        title: <span className="font-mono">{channelId}</span>,
        badges: (
          <>
            <Badge
              variant={
                access === "public" ? "info" : access === "protected" ? "warning" : "default"
              }
            >
              {access}
            </Badge>
            {channel.presence === undefined ? null : <Badge>presence</Badge>}
            {replay ? <Badge>replay</Badge> : null}
          </>
        ),
        description: "Typed event, replay, presence, and exposure metadata.",
        meta: (
          <>
            <MetaItem label="id" copy={channelId}>
              {channelId}
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
            <SourceLink source={record(channel.source)} />
          </>
        ),
        actions: <GraphAction id={channelId} />,
      }}
      aside={
        <Section id="channel-facts" title="Channel detail">
          <DetailList
            items={[
              { label: "Channel ID", value: channelId, mono: true, copy: channelId },
              { label: "Access", value: access, mono: true },
              { label: "Profile", value: text(channel.profile) || "default", mono: true },
              { label: "Presence", value: presence(channel.presence), mono: true },
              {
                label: "Replay",
                value: replay
                  ? `${typeof replay.retentionMs === "number" ? replay.retentionMs.toLocaleString("en-US") : "?"} ms retention`
                  : "live only",
                mono: true,
              },
              {
                label: "Events",
                value: events.length === 0 ? "none" : events.join(", "),
                mono: true,
              },
            ]}
          />
        </Section>
      }
    >
      <ChannelLiveConsole channel={channel} />
      <SchemaPanel title="Event schemas" value={channel.events} />
      <div className={replay ? "grid min-w-0 gap-4 2xl:grid-cols-2" : "grid min-w-0 gap-4"}>
        <SchemaPanel title="Partition params" value={channel.params} />
        {replay ? <SchemaPanel title="Replay" value={replay} /> : null}
      </div>
    </DetailLayout>
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
