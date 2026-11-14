"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { InspectorObject } from "../../lib/api-types";
import {
  deliveryTime,
  deliveryTraceId,
  payloadPreview,
  publicationTime,
} from "../../lib/event-rows";
import { formatTimestamp, utcTimestamp } from "../../lib/format";
import { StatusBadge, statusTone } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import { ActionOutcome, type ActionOutcomeState } from "./event-action-outcome";

/** One accepted publication: when it happened, what it carried, where it ran, and a way to replay it. */
export function PublicationRow({
  publication,
  publications,
  busy,
  outcome,
  onReplay,
}: {
  readonly publication: InspectorObject;
  readonly publications: readonly InspectorObject[];
  readonly busy: boolean;
  readonly outcome: ActionOutcomeState | undefined;
  readonly onReplay: (id: string) => void;
}) {
  const id = text(publication.instanceId) || text(publication.publicationId);
  if (id === "") return null;
  const preview = payloadPreview(publication);
  const traceId = text(publication.traceId);
  return (
    <li id={`publication-${id}`} className="grid min-w-0 gap-1.5 scroll-mt-20 text-xs">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <code className="font-mono break-all">{id}</code>
          <Time value={publicationTime(publication)} />
          {traceId === "" ? null : <TraceLink traceId={traceId} />}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isDisabled={busy}
          aria-label={`Replay publication ${id}`}
          onPress={() => onReplay(id)}
        >
          Replay
        </Button>
      </div>
      {preview === undefined ? null : (
        <code className="block min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {preview}
        </code>
      )}
      <ActionOutcome outcome={outcome} publications={publications} />
    </li>
  );
}

/** One delivery: its state and time, a link to the trace, and retry or cancel when its state allows. */
export function DeliveryRow({
  delivery,
  publications,
  busy,
  outcome,
  onRetry,
  onCancel,
}: {
  readonly delivery: InspectorObject;
  readonly publications: readonly InspectorObject[];
  readonly busy: boolean;
  readonly outcome: ActionOutcomeState | undefined;
  readonly onRetry: (id: string) => void;
  readonly onCancel: (id: string) => void;
}) {
  const id = text(delivery.deliveryId);
  if (id === "") return null;
  const state = text(delivery.state);
  const retry = state === "dead-lettered";
  const cancel = ["available", "delayed", "leased", "retrying"].includes(state);
  const traceId = deliveryTraceId(delivery, publications);
  return (
    <li className="grid min-w-0 gap-1.5 text-xs">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <code className="font-mono break-all">{id}</code>
          {state === "" ? (
            <span className="text-muted-foreground">state unavailable</span>
          ) : (
            <StatusBadge
              tone={state === "dead-lettered" ? "danger" : statusTone(state)}
              label={state}
            />
          )}
          <Time value={deliveryTime(delivery)} />
          {traceId === undefined ? null : <TraceLink traceId={traceId} />}
        </span>
        <span className="flex gap-2">
          {retry ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={busy}
              aria-label={`Retry delivery ${id}`}
              onPress={() => onRetry(id)}
            >
              Retry
            </Button>
          ) : null}
          {cancel ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={busy}
              aria-label={`Cancel delivery ${id}`}
              onPress={() => onCancel(id)}
            >
              Cancel
            </Button>
          ) : null}
        </span>
      </div>
      <ActionOutcome outcome={outcome} publications={publications} />
    </li>
  );
}

function Time({ value }: { readonly value: string }): ReactNode {
  if (value === "") return null;
  return (
    <time
      className="font-mono text-[11px] text-muted-foreground tabular-nums"
      dateTime={value}
      title={utcTimestamp(value)}
    >
      {formatTimestamp(value)}
    </time>
  );
}

function TraceLink({ traceId }: { readonly traceId: string }) {
  return (
    <Link className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
      Open trace
    </Link>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
