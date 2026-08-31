import type { InspectorObject } from "../../lib/api-types";
import Link from "next/link";
import { deliveryCounts, type EventView } from "../../lib/events-model";

export function EventPublisherPanel({
  publishers,
}: {
  readonly publishers: readonly InspectorObject[];
}) {
  return (
    <section className="panel relationship-panel" aria-labelledby="event-publishers-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GRAPH RELATIONSHIPS</p>
          <h2 id="event-publishers-heading">Publishers</h2>
        </div>
        <span className="badge">{publishers.length}</span>
      </div>
      {publishers.length === 0 ? (
        <p className="supporting-copy">No publishers are declared.</p>
      ) : (
        <ul className="request-list">
          {publishers.map((edge, index) => (
            <li className="request-row" key={`${text(edge.from)}:${index}`}>
              <code>{text(edge.from) || "unknown function"}</code>
              <span>publishes this event</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventListenerPanel({
  listeners,
}: {
  readonly listeners: readonly InspectorObject[];
}) {
  return (
    <section className="panel relationship-panel" aria-labelledby="event-listeners-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EVENT TRIGGERS</p>
          <h2 id="event-listeners-heading">Consumer functions</h2>
        </div>
        <span className="badge">{listeners.length}</span>
      </div>
      {listeners.length === 0 ? (
        <p className="supporting-copy">No event functions consume this version.</p>
      ) : (
        <ul className="request-list">
          {listeners.map((listener) => (
            <ListenerRow key={text(listener.id)} listener={listener} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ListenerRow({ listener }: { readonly listener: InspectorObject }) {
  const config = record(listener.config);
  return (
    <li className="request-row">
      <span>
        <Link href={`/functions/${encodeURIComponent(text(listener.targetFunctionId))}`}>
          {text(listener.targetFunctionId) || "function unavailable"}
        </Link>
        <br />
        <small>Trigger: {text(listener.id)}</small>
      </span>
      <span>
        {text(config?.delivery) || "delivery unavailable"} ·{" "}
        {text(config?.profile) || "default profile"}
      </span>
      <span>
        Event: {text(config?.eventId)}@{number(config?.eventVersion)}
      </span>
      <span>Policy: {format(config?.retry)}</span>
    </li>
  );
}

export function EventDeliveryPanel({
  deliveries,
  deadLetters,
  publications,
}: Pick<EventView, "deliveries" | "deadLetters" | "publications">) {
  const counts = deliveryCounts(deliveries);
  return (
    <section className="panel" aria-labelledby="event-delivery-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DELIVERY STATE</p>
          <h2 id="event-delivery-heading">Deliveries and dead letters</h2>
        </div>
        <span className="badge">{deliveries.length}</span>
      </div>
      <dl className="overview-metrics">
        <Metric label="Available" value={counts.available} />
        <Metric label="Leased" value={counts.leased} />
        <Metric label="Delayed" value={counts.delayed} />
        <Metric label="Completed" value={counts.completed} />
        <Metric label="Dead letters" value={counts["dead-lettered"]} />
      </dl>
      {deliveries.length === 0 ? (
        <p className="supporting-copy">No delivery attempts are retained.</p>
      ) : (
        <ul className="request-list">
          {deliveries.map((item, index) => (
            <DeliveryRow key={text(item.deliveryId) || String(index)} item={item} />
          ))}
        </ul>
      )}
      <p className="supporting-copy">
        {publications.length} accepted publication(s) are recorded. Durable listeners are
        at-least-once; ordering is shown only when the API advertises it.
      </p>
      {deadLetters.length > 0 && (
        <p className="field-errors" role="status">
          {deadLetters.length} dead-lettered delivery attempt(s) need local operator handling.
        </p>
      )}
    </section>
  );
}

function DeliveryRow({ item }: { readonly item: InspectorObject }) {
  const failure = record(item.failure);
  return (
    <li className="request-row">
      <span>
        <strong>{text(item.state) || "state unavailable"}</strong>
        <br />
        <small>{text(item.deliveryId) || "delivery unavailable"}</small>
      </span>
      <span>
        Attempt {number(item.attempt)} · trigger {text(item.triggerId) || "unknown"}
      </span>
      {failure === undefined ? null : (
        <span>
          {text(failure.code) || "failure"}: {text(failure.message) || "details unavailable"}
        </span>
      )}
    </li>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value.toLocaleString("en-US")}</dd>
    </div>
  );
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function format(value: unknown): string {
  if (value === undefined) return "default";
  try {
    return JSON.stringify(value);
  } catch {
    return "unavailable";
  }
}
function number(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
