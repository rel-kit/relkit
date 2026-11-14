import Link from "next/link";
import { Section } from "../components/blocks/section";
import { DetailList, type DetailItem } from "../components/blocks/details";
import type { InspectorObject } from "../lib/api-types";
import { text, number, type SignalKind } from "../lib/observability-model";

/** The record panel beside a request or trace: identifiers, outcome, status, times and counts. */
export function IdentityPanel({
  kind,
  id,
  value,
  traceId,
  spanCount,
  errorId,
}: {
  readonly kind: SignalKind;
  readonly id: string;
  readonly value: InspectorObject;
  readonly traceId: string;
  readonly spanCount: number;
  /** The declared error the request ended with, when it recorded one. */
  readonly errorId?: string | undefined;
}) {
  const recordTraceId = text(value.traceId);
  const routeId = known(text(value.routeId));
  const functionId = known(text(value.functionId));
  const items: DetailItem[] = [
    {
      label: kind === "requests" ? "Request ID" : "Trace ID",
      value: id,
      mono: true,
      copy: id,
    },
    ...(kind === "requests"
      ? [
          {
            label: "Trace ID",
            value: recordTraceId || "Unavailable",
            mono: true,
            ...(recordTraceId ? { copy: recordTraceId } : {}),
          },
        ]
      : []),
    ...(routeId
      ? [
          {
            label: "Route",
            mono: true,
            value: (
              <Link className="text-link" href={`/routes/${encodeURIComponent(routeId)}`}>
                {routeId}
              </Link>
            ),
          },
        ]
      : []),
    ...(functionId
      ? [
          {
            label: "Function",
            mono: true,
            value: (
              <Link className="text-link" href={`/functions/${encodeURIComponent(functionId)}`}>
                {functionId}
              </Link>
            ),
          },
        ]
      : []),
    { label: "Outcome", value: text(value.outcome) || "Unavailable" },
    ...(errorId
      ? [
          {
            label: "Error",
            mono: true,
            value: (
              <Link className="text-link break-all" href={`/errors/${encodeURIComponent(errorId)}`}>
                {errorId}
              </Link>
            ),
          },
        ]
      : []),
    {
      label: "Status",
      value: number(value.status) === undefined ? "Unavailable" : String(value.status),
      mono: true,
    },
    { label: "Started", value: text(value.startedAt) || "Unavailable", mono: true },
    { label: "Completed", value: text(value.completedAt) || "In progress", mono: true },
    {
      label: "Duration",
      value: number(value.durationMs) === undefined ? "Unavailable" : `${value.durationMs} ms`,
      mono: true,
    },
    { label: "Spans", value: String(spanCount), mono: true },
  ];
  return (
    <Section
      id="signal-identity"
      title={kind === "requests" ? "Request record" : "Trace record"}
      description="Redaction-first"
    >
      <DetailList items={items} />
      {traceId !== "" && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Correlated trace:{" "}
          <Link
            className="text-link font-mono break-all"
            href={`/traces/${encodeURIComponent(traceId)}`}
          >
            {bounded(traceId)}
          </Link>
        </p>
      )}
    </Section>
  );
}

function known(value: string): string {
  return value === "unknown" ? "" : value;
}

function bounded(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 68)}…${value.slice(-20)}`;
}
