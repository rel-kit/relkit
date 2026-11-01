import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, type StatusTone } from "../../components/neon/status-badge";
import type { InspectorObject } from "../../lib/api-types";
import { clockTime, formatDuration } from "../../lib/format";
import { text } from "../../lib/observability-model";

/**
 * The request behind a log's trace as a compact checkpoint rail: what ran, how it ended, and the
 * start → end span with its duration.
 */
export function TraceSummary({ summary }: { readonly summary: InspectorObject }) {
  const method = text(summary.method);
  const path = text(summary.rawPath);
  const request = [method, path].filter(Boolean).join(" ");
  const routeId = known(text(summary.routeId));
  const functionId = known(text(summary.functionId));
  const outcome = text(summary.outcome);
  const status = typeof summary.status === "number" ? summary.status : undefined;
  const durationMs = typeof summary.durationMs === "number" ? summary.durationMs : undefined;
  const requestLabel = (
    <>
      {method ? (
        <span className="route-method" data-method={method}>
          {method}
        </span>
      ) : null}
      {path || request}
    </>
  );
  const items: readonly {
    readonly label: string;
    readonly value: ReactNode;
    readonly visible: boolean;
  }[] = [
    {
      label: "Request",
      value: routeId ? (
        <Link className="text-link" href={`/routes/${encodeURIComponent(routeId)}`}>
          {requestLabel}
        </Link>
      ) : (
        requestLabel
      ),
      visible: request !== "",
    },
    {
      label: "Function",
      value: functionId ? (
        <Link className="text-link" href={`/functions/${encodeURIComponent(functionId)}`}>
          {functionId}
        </Link>
      ) : null,
      visible: functionId !== "",
    },
    {
      label: "Outcome",
      value: (
        <span className="trace-outcome">
          {outcome && <StatusBadge tone={outcomeTone(outcome)} label={outcome} />}
          {status !== undefined && <span>HTTP {status}</span>}
        </span>
      ),
      visible: outcome !== "" || status !== undefined,
    },
    {
      label: "Duration",
      value: durationMs === undefined ? "" : formatDuration(durationMs),
      visible: durationMs !== undefined,
    },
    { label: "Started at", value: text(summary.startedAt), visible: !!summary.startedAt },
    { label: "Ended at", value: text(summary.completedAt), visible: !!summary.completedAt },
  ];
  const shown = new Map(items.filter((item) => item.visible).map((item) => [item.label, item]));
  const started = text(summary.startedAt);
  const ended = text(summary.completedAt);
  const tone = outcome ? outcomeTone(outcome) : "neutral";
  return (
    <div className="trace-summary">
      <dl className="trace-summary-facts">
        {["Request", "Function", "Outcome"].map((label) => {
          const item = shown.get(label);
          return item ? (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{item.value}</dd>
            </div>
          ) : null;
        })}
      </dl>
      {(started || ended) && (
        <ol className="trace-summary-rail" aria-label="Request span">
          <li>
            <span className="trace-summary-marker" data-tone="neutral" aria-hidden="true" />
            <span className="trace-summary-label">Started at</span>
            <time dateTime={started || undefined} title={started || undefined}>
              {started ? clockTime(started) : "—"}
            </time>
          </li>
          <li className="trace-summary-span" aria-hidden="true">
            <span className="trace-summary-bar" data-tone={tone} />
            <span>{durationMs === undefined ? "" : formatDuration(durationMs)}</span>
          </li>
          <li>
            <span
              className="trace-summary-marker"
              data-tone={ended ? tone : "live"}
              aria-hidden="true"
            />
            <span className="trace-summary-label">Ended at</span>
            <time dateTime={ended || undefined} title={ended || undefined}>
              {ended ? clockTime(ended) : "In progress"}
            </time>
          </li>
        </ol>
      )}
      {durationMs !== undefined && (
        <span className="sr-only">Duration {formatDuration(durationMs)}</span>
      )}
    </div>
  );
}

/** Unmatched requests report "unknown" owners; there is nothing to link to. */
function known(value: string): string {
  return value === "unknown" ? "" : value;
}

function outcomeTone(outcome: string): StatusTone {
  if (outcome === "success") return "success";
  if (outcome === "timeout" || outcome === "cancelled") return "warning";
  return outcome === "" ? "neutral" : "danger";
}
