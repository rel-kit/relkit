import Link from "next/link";
import type { InspectorObject } from "../../lib/api-types";
import { EventDeliveryPanel, EventListenerPanel, EventPublisherPanel } from "./event-state-panels";
import type { EventView } from "../../lib/events-model";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { SchemaPanel } from "../schema-panel";

/** Contract facts for the detail rail. */
export function EventFacts({ view }: { readonly view: EventView }) {
  const event = view.event;
  const id = text(event.id);
  const domainId = text(event.domainId);
  return (
    <Section id="event-facts" title="Event detail">
      <DetailList
        items={[
          { label: "Event ID", value: id || "Unknown", mono: true, copy: id },
          { label: "Version", value: `v${number(event.version)}`, mono: true },
          {
            label: "Domain",
            value: domainId ? (
              <Link
                href={`/domains/${encodeURIComponent(domainId)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {domainId}
              </Link>
            ) : (
              "unowned"
            ),
            mono: true,
          },
          { label: "Exposure", value: text(event.exposure) || "internal", mono: true },
          { label: "Profile", value: text(event.profile) || "default", mono: true },
          { label: "Sensitive fields", value: fieldList(event.sensitiveFields), mono: true },
          { label: "Publishers", value: String(view.publishers.length), mono: true },
          { label: "Consumers", value: String(view.listeners.length), mono: true },
        ]}
      />
    </Section>
  );
}

export function EventContract({ view }: { readonly view: EventView }) {
  return (
    <>
      <SchemaPanel title="Input schema" value={view.event.input} />
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <EventPublisherPanel publishers={view.publishers} />
        <EventListenerPanel listeners={view.listeners} />
      </div>
      <EventDeliveryPanel
        deliveries={view.deliveries}
        deadLetters={view.deadLetters}
        publications={view.publications}
      />
    </>
  );
}

export function eventRecord(value: unknown): InspectorObject | undefined {
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
