import type { ReactNode } from "react";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Badge } from "../components/ui/badge";
import type { InspectorObject } from "../lib/api-types";
import { formatDuration, middleTruncate, relativeTime } from "../lib/format";
import { text, number, type SignalKind } from "../lib/observability-model";
import { requestFailure } from "../lib/request-failure";
import { DetailLayout } from "./detail-layout";
import {
  ContinuationsPanel,
  LogsPanel,
  RequestsPanel,
  RequestExchangePanel,
  TimelinePanel,
  WaterfallPanel,
} from "./signal-detail-sections";
import { FailurePanel } from "./signal-detail-failure";
import { IdentityPanel } from "./signal-detail-identity";
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
            <FailurePanel request={request} spans={props.spans} logs={props.logs} />
          )}
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
          errorId={
            isRequest ? requestFailure(identity, props.spans, props.logs).errorId : undefined
          }
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
