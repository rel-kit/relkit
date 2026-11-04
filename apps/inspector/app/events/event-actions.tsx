"use client";

import { useState, type FormEvent } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import {
  actionFailure,
  actionPath,
  parseJsonInput,
  postInspectorAction,
  type ActionIdentity,
  type StartActionPath,
} from "../../lib/inspector-actions";
import { Section } from "../../components/blocks/section";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { fieldControlClass, fieldTextareaClass } from "../schema-form";

/** Publish, replay, retry and cancel controls for one event. */
export function EventActions({
  eventId,
  eventVersion,
  identity,
  publications,
  deliveries,
  onChange,
}: {
  readonly eventId: string;
  readonly eventVersion?: number;
  readonly identity: ActionIdentity;
  readonly publications: readonly InspectorObject[];
  readonly deliveries: readonly InspectorObject[];
  readonly onChange: () => Promise<void>;
}) {
  const [payload, setPayload] = useState("{}");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const run = async (path: StartActionPath, body: Record<string, unknown>, done: string) => {
    setPending(true);
    setStatus("");
    try {
      await postInspectorAction(createInspectorClient(), path, identity, body);
      await onChange();
      setStatus(done);
    } catch (error) {
      setStatus(actionFailure(error));
    } finally {
      setPending(false);
    }
  };

  const publish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseJsonInput(payload);
    if (!parsed.ok) return setStatus(parsed.error);
    void run(
      actionPath("events", eventId, "publish"),
      { input: parsed.value, ...(eventVersion === undefined ? {} : { eventVersion }) },
      `Published ${eventId}.`,
    );
  };

  return (
    <Section
      id="event-actions"
      aria-labelledby="event-actions-heading"
      title={<span id="event-actions-heading">Event actions</span>}
      description="Publish this event, deliver a recorded publication again, or retry and cancel deliveries"
    >
      <form className="grid gap-2" onSubmit={publish}>
        <label className="text-xs font-medium" htmlFor="event-payload">
          Event payload (JSON)
        </label>
        <textarea
          id="event-payload"
          className={cn(fieldControlClass, fieldTextareaClass, "font-mono text-xs")}
          rows={4}
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={pending}>
            Publish event
          </Button>
        </div>
      </form>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0" aria-label="Publications">
        {publications.map((publication) => {
          const id = text(publication.instanceId) || text(publication.publicationId);
          if (id === "") return null;
          return (
            <li key={id} className="flex items-center justify-between gap-2 text-xs">
              <code className="font-mono">{id}</code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                aria-label={`Replay publication ${id}`}
                onClick={() =>
                  void run(actionPath("events", id, "replay"), {}, `Replayed publication ${id}.`)
                }
              >
                Replay
              </Button>
            </li>
          );
        })}
      </ul>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0" aria-label="Delivery actions">
        {deliveries.map((delivery) => {
          const id = text(delivery.deliveryId);
          const state = text(delivery.state);
          if (id === "") return null;
          const retry = state === "dead-lettered";
          const cancel = ["available", "delayed", "leased", "retrying"].includes(state);
          return (
            <li key={id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                <code className="font-mono">{id}</code> · {state || "state unavailable"}
              </span>
              <span className="flex gap-2">
                {retry ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    aria-label={`Retry delivery ${id}`}
                    onClick={() =>
                      void run(actionPath("events", id, "retry"), {}, `Retried delivery ${id}.`)
                    }
                  >
                    Retry
                  </Button>
                ) : null}
                {cancel ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    aria-label={`Cancel delivery ${id}`}
                    onClick={() =>
                      void run(actionPath("events", id, "cancel"), {}, `Cancelled delivery ${id}.`)
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>
    </Section>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
