import type { InspectorObject } from "../../lib/api-types";
import type { ReactNode } from "react";
import { EventDeliveryPanel, EventListenerPanel, EventPublisherPanel } from "./event-state-panels";
import type { EventView } from "../../lib/events-model";
import { SourceLink } from "../source-link";
import { SchemaPanel } from "../schema-panel";

export function EventContract({ view }: { readonly view: EventView }) {
  const event = view.event;
  const source = record(event.source);
  return (
    <>
      <section className="panel route-identity" aria-labelledby="event-contract-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVENT CONTRACT</p>
            <h2 id="event-contract-heading">
              {text(event.id)}@{number(event.version)}
            </h2>
          </div>
          <span className="badge">version {number(event.version)}</span>
        </div>
        <dl className="route-meta">
          <Meta label="Event ID" value={text(event.id) || "Unknown"} />
          <Meta label="Source" value={<SourceLink source={source} />} />
          <Meta label="Sensitive fields" value={fieldList(event.sensitiveFields)} />
        </dl>
      </section>
      <div className="route-contract-grid">
        <JsonPanel title="Input schema" value={event.input} />
        <JsonPanel
          title="Consumers and delivery summary"
          value={{
            consumers: view.consumers.map((consumer) => ({
              id: consumer.id,
              invocationMode: consumer.invocationMode,
            })),
            listeners: view.listeners.map((listener) => ({
              id: listener.id,
              targetFunctionId: listener.targetFunctionId,
              config: listener.config,
            })),
          }}
        />
      </div>
      <EventPublisherPanel publishers={view.publishers} />
      <EventListenerPanel listeners={view.listeners} />
      <EventDeliveryPanel
        deliveries={view.deliveries}
        deadLetters={view.deadLetters}
        publications={view.publications}
      />
    </>
  );
}

function JsonPanel({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <SchemaPanel title={title} value={value} eyebrow="CONTRACT DATA" />;
}

function Meta({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function fieldList(value: unknown): string {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.join(", ") || "None reported"
    : "None reported";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function number(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
}
