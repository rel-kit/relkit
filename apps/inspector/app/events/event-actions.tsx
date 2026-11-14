"use client";

import { useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { actionAnswer } from "../../lib/action-answer";
import { createInspectorClient } from "../../lib/client";
import {
  confirmation,
  eventActionSuccess,
  unsupportedText,
  type EventActionKind,
} from "../../lib/event-action-text";
import { actionPath, postInspectorAction, type ActionIdentity } from "../../lib/inspector-actions";
import { Section } from "../../components/blocks/section";
import { ConfirmationDialog } from "../confirmation-dialog";
import type { ActionOutcomeState } from "./event-action-outcome";
import { EventPublishForm } from "./event-publish-form";
import { DeliveryRow, PublicationRow } from "./event-rows";

/** What the confirmation step is asking about. */
interface Pending {
  readonly kind: EventActionKind;
  /** The event, publication or delivery the action is about. */
  readonly target: string;
  /** Which control shows the outcome. */
  readonly key: string;
  readonly body: Record<string, unknown>;
}

/** Publish, replay, retry and cancel controls for one event; each asks first and answers beside itself. */
export function EventActions({
  eventId,
  eventVersion,
  schema,
  identity,
  publications,
  deliveries,
  onChange,
}: {
  readonly eventId: string;
  readonly eventVersion?: number;
  /** The event's input schema node. */
  readonly schema: unknown;
  readonly identity: ActionIdentity;
  readonly publications: readonly InspectorObject[];
  readonly deliveries: readonly InspectorObject[];
  readonly onChange: () => Promise<void>;
}) {
  const [asking, setAsking] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, ActionOutcomeState>>>({});

  const run = async ({ kind, target, key, body }: Pending) => {
    setBusy(true);
    setOutcomes(({ [key]: _previous, ...rest }) => rest);
    let outcome: ActionOutcomeState;
    try {
      const receipt = await postInspectorAction(
        createInspectorClient(),
        actionPath("events", target, kind),
        identity,
        body,
      );
      await onChange();
      outcome = { kind: "success", ...eventActionSuccess(kind, target, receipt) };
    } catch (error) {
      outcome = {
        kind: "failure",
        answer: actionAnswer(error, "event", { unsupported: unsupportedText(kind) }),
      };
    }
    setOutcomes((current) => ({ ...current, [key]: outcome }));
    setBusy(false);
    setAsking(undefined);
  };

  const ask = (next: Pending) => setAsking(next);
  const dialog = asking === undefined ? undefined : confirmation(asking.kind, asking.target);
  return (
    <Section
      id="event-actions"
      aria-labelledby="event-actions-heading"
      title={<span id="event-actions-heading">Event actions</span>}
      description="Publish this event, deliver a recorded publication again, or retry and cancel deliveries"
    >
      <EventPublishForm
        schema={schema}
        busy={busy}
        outcome={outcomes.publish}
        publications={publications}
        onPublish={(value) =>
          ask({
            kind: "publish",
            target: eventId,
            key: "publish",
            body: { input: value, ...(eventVersion === undefined ? {} : { eventVersion }) },
          })
        }
      />
      <ul className="m-0 mt-4 grid list-none gap-3 p-0" aria-label="Publications">
        {publications.map((publication) => (
          <PublicationRow
            key={String(publication.instanceId ?? publication.publicationId)}
            publication={publication}
            publications={publications}
            busy={busy}
            outcome={
              outcomes[`replay:${String(publication.instanceId ?? publication.publicationId)}`]
            }
            onReplay={(id) => ask({ kind: "replay", target: id, key: `replay:${id}`, body: {} })}
          />
        ))}
      </ul>
      <ul className="m-0 mt-4 grid list-none gap-3 p-0" aria-label="Delivery actions">
        {deliveries.map((delivery) => (
          <DeliveryRow
            key={String(delivery.deliveryId)}
            delivery={delivery}
            publications={publications}
            busy={busy}
            outcome={outcomes[`delivery:${String(delivery.deliveryId)}`]}
            onRetry={(id) => ask({ kind: "retry", target: id, key: `delivery:${id}`, body: {} })}
            onCancel={(id) => ask({ kind: "cancel", target: id, key: `delivery:${id}`, body: {} })}
          />
        ))}
      </ul>
      <ConfirmationDialog
        open={asking !== undefined}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.confirmLabel ?? "Confirm"}
        busy={busy}
        onConfirm={() => asking !== undefined && void run(asking)}
        onCancel={() => setAsking(undefined)}
      />
    </Section>
  );
}
