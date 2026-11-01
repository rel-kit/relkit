import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "../components/blocks/section";
import { DetailList, type DetailItem } from "../components/blocks/details";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Badge } from "../components/ui/badge";
import type { InspectorObject } from "../lib/api-types";
import { formatDuration, middleTruncate, relativeTime } from "../lib/format";
import { text, number, type SignalKind } from "../lib/observability-model";
import { DetailLayout } from "./detail-layout";
import {
  ContinuationsPanel,
  LogsPanel,
  RequestsPanel,
  RequestExchangePanel,
  TimelinePanel,
  WaterfallPanel,
} from "./signal-detail-sections";
import { RuntimeStatus } from "./runtime-status";
import { requestPath } from "./signal-rows";

interface SignalDetailViewProps {
  readonly kind: SignalKind;
  readonly id: string;
  readonly request?: InspectorObject;
  readonly trace?: InspectorObject;
  readonly records: readonly InspectorObject[];
  readonly spans: readonly InspectorObject[];
  readonly logs: readonly InspectorObject[];
  readonly requests: readonly InspectorObject[];
  readonly liveState: string;
  readonly continuations?: readonly InspectorObject[];
  readonly incomplete?: readonly string[];
  /** Paging notice shown above the main column, e.g. a partial trace with more records. */
  readonly notice?: ReactNode;
}

export function SignalDetailView(props: SignalDetailViewProps) {
  const isRequest = props.kind === "requests";
  const request = props.request;
  const trace = props.trace ?? props.requests[0];
  const identity = request ?? trace ?? {};
  const traceId = text(request?.traceId) || text(trace?.traceId);
  const title = isRequest ? "Request detail" : "Trace detail";
  const method = text(identity.method);
  const route = requestPath(identity);
  const name = route || text(trace?.name) || text(props.spans[0]?.name);
  const outcome = text(identity.outcome);
  const status = number(identity.status);
  const durationMs = number(identity.durationMs);
  const startedAt = text(identity.startedAt);
  return (
    <DetailLayout
      header={{
        title,
        description: name ? (
          <span className="flex min-w-0 items-center gap-0 font-mono text-[13px] text-foreground">
            {method ? (
              <span className="route-method" data-method={method}>
                {method}
              </span>
            ) : null}
            <span className="truncate">{name}</span>
          </span>
        ) : undefined,
        badges: (
          <>
            {outcome ? <StatusBadge tone={statusTone(outcome)} label={outcome} /> : null}
            {status !== undefined ? (
              <Badge variant={status >= 500 ? "error" : status >= 400 ? "warning" : "default"}>
                HTTP {status}
              </Badge>
            ) : null}
          </>
        ),
        meta: (
          <>
            <span title={props.id}>{middleTruncate(props.id, 40)}</span>
            {durationMs !== undefined ? <span>{formatDuration(durationMs)}</span> : null}
            {startedAt ? (
              <time dateTime={startedAt} title={startedAt}>
                {relativeTime(startedAt)}
              </time>
            ) : null}
          </>
        ),
        actions: (
          <span role="status" aria-live="polite">
            <StatusBadge
              tone={props.liveState === "connected" ? "live" : statusTone(props.liveState)}
              label={`Live: ${props.liveState}`}
            />
          </span>
        ),
      }}
      lead={
        <>
          {props.notice}
          {isRequest && request !== undefined && (
            <TimelinePanel request={request} spans={props.spans} />
          )}
          {!isRequest && <WaterfallPanel spans={props.spans} requests={props.requests} />}
        </>
      }
      aside={
        <IdentityPanel
          kind={props.kind}
          id={props.id}
          value={identity}
          traceId={isRequest ? traceId : ""}
          spanCount={props.spans.length}
        />
      }
    >
      {isRequest && request !== undefined && <RequestExchangePanel request={request} />}
      {isRequest && (
        <ContinuationsPanel items={props.continuations ?? []} incomplete={props.incomplete ?? []} />
      )}
      {!isRequest && props.requests.length > 0 && <RequestsPanel items={props.requests} />}
      <LogsPanel items={props.logs} />
      <RuntimeStatus telemetryOnly />
    </DetailLayout>
  );
}

function IdentityPanel({
  kind,
  id,
  value,
  traceId,
  spanCount,
}: {
  readonly kind: SignalKind;
  readonly id: string;
  readonly value: InspectorObject;
  readonly traceId: string;
  readonly spanCount: number;
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
