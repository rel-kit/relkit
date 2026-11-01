import type { InspectorObject } from "../../lib/api-types";
import { Section } from "../../components/blocks/section";
import { Stat, StatGroup } from "../../components/blocks/stat";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import { StatusBadge, statusTone } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { deliveryCounts, type EventView } from "../../lib/events-model";
import { Count, EntityList, Quiet } from "../domains/catalog-kit";

export function EventPublisherPanel({
  publishers,
}: {
  readonly publishers: readonly InspectorObject[];
}) {
  return (
    <Section
      id="event-publishers"
      aria-labelledby="event-publishers-heading"
      title={<span id="event-publishers-heading">Publishers</span>}
      description="Functions that publish this event"
      actions={<Count value={publishers.length} />}
      flush
    >
      <EntityList
        empty="No publishers are declared."
        rows={publishers.map((edge, index) => {
          const from = text(edge.from);
          return {
            key: `${from}:${index}`,
            href: from ? `/functions/${encodeURIComponent(from)}` : undefined,
            title: from || "unknown function",
            trailing: <Badge>publishes</Badge>,
          };
        })}
      />
    </Section>
  );
}

export function EventListenerPanel({
  listeners,
}: {
  readonly listeners: readonly InspectorObject[];
}) {
  return (
    <Section
      id="event-listeners"
      aria-labelledby="event-listeners-heading"
      title={<span id="event-listeners-heading">Consumer functions</span>}
      description="Functions triggered by this exact event version"
      actions={<Count value={listeners.length} />}
      flush
    >
      <EntityList
        empty="No event functions consume this version."
        rows={listeners.map((listener) => {
          const config = record(listener.config);
          const target = text(listener.targetFunctionId);
          const delivery = text(config?.delivery);
          return {
            key: text(listener.id),
            href: target ? `/functions/${encodeURIComponent(target)}` : undefined,
            lead: (
              <StatusBadge
                tone={delivery === "durable" ? "success" : delivery ? "info" : "neutral"}
                label={delivery || "delivery unavailable"}
              />
            ),
            title: target || "function unavailable",
            detail: (
              <>
                {text(config?.eventId)}@{number(config?.eventVersion)} ·{" "}
                {text(config?.profile) || "default profile"}
              </>
            ),
            trailing: <Quiet>{retrySummary(config?.retry)}</Quiet>,
          };
        })}
      />
    </Section>
  );
}

export function EventDeliveryPanel({
  deliveries,
  deadLetters,
  publications,
}: Pick<EventView, "deliveries" | "deadLetters" | "publications">) {
  const counts = deliveryCounts(deliveries);
  const entries: HistoryEntry[] = deliveries.map((item, index) => {
    const failure = record(item.failure);
    const state = text(item.state) || "state unavailable";
    return {
      id: text(item.deliveryId) || String(index),
      tone: state === "dead-lettered" ? "danger" : statusTone(state),
      statusLabel: state,
      lead: state,
      title: text(item.deliveryId) || "delivery unavailable",
      meta: [
        `attempt ${number(item.attempt)}`,
        `trigger ${text(item.triggerId) || "unknown"}`,
        ...(failure === undefined
          ? []
          : [
              `${text(failure.code) || "failure"}: ${text(failure.message) || "details unavailable"}`,
            ]),
      ],
      ...(deliveryTime(item) ? { at: deliveryTime(item) } : {}),
    };
  });
  return (
    <Section
      id="event-delivery"
      aria-labelledby="event-delivery-heading"
      title={<span id="event-delivery-heading">Deliveries and dead letters</span>}
      description={`${publications.length} accepted publication(s) recorded · durable listeners are at-least-once`}
      actions={<Count value={deliveries.length} />}
      flush
    >
      <div className="border-b border-border p-3">
        <StatGroup className="xl:grid-cols-5">
          <Stat label="Available" value={counts.available} />
          <Stat label="Leased" value={counts.leased} />
          <Stat
            label="Delayed"
            value={counts.delayed}
            tone={counts.delayed > 0 ? "warning" : "default"}
          />
          <Stat
            label="Completed"
            value={counts.completed}
            tone={counts.completed > 0 ? "success" : "default"}
          />
          <Stat
            label="Dead letters"
            value={counts["dead-lettered"]}
            tone={counts["dead-lettered"] > 0 ? "danger" : "default"}
          />
        </StatGroup>
      </div>
      {deadLetters.length > 0 && (
        <p
          className="m-0 max-w-none border-b border-border bg-danger-soft px-4 py-2 text-xs text-danger"
          role="status"
        >
          {deadLetters.length} dead-lettered delivery attempt(s) need local operator handling.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
          No delivery attempts are retained. Ordering is shown only when the API advertises it.
        </p>
      ) : (
        <HistoryList label="Delivery attempts" entries={entries} showDurationBars={false} />
      )}
    </Section>
  );
}

function deliveryTime(item: InspectorObject): string {
  return text(item.updatedAt) || text(item.availableAt) || text(item.createdAt);
}

function retrySummary(value: unknown): string {
  const retry = record(value);
  if (retry === undefined) return "default retry";
  const attempts = typeof retry.maxAttempts === "number" ? retry.maxAttempts : undefined;
  return attempts === undefined
    ? "custom retry"
    : `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`;
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function number(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
