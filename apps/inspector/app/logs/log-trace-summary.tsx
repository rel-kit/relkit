import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import type { InspectorObject } from "../../lib/api-types";
import { text } from "../../lib/observability-model";

export function TraceSummary({ summary }: { readonly summary: InspectorObject }) {
  const request = [text(summary.method), text(summary.rawPath)].filter(Boolean).join(" ");
  const routeId = text(summary.routeId);
  const functionId = text(summary.functionId);
  const outcome = text(summary.outcome);
  const status = typeof summary.status === "number" ? summary.status : undefined;
  const items = [
    {
      label: "Request",
      value: routeId ? (
        <Link className="text-link" href={`/routes/${encodeURIComponent(routeId)}`}>
          {request}
        </Link>
      ) : (
        request
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
          {outcome && <Badge variant={outcomeVariant(outcome)}>{outcome}</Badge>}
          {status !== undefined && <span>HTTP {status}</span>}
        </span>
      ),
      visible: outcome !== "" || status !== undefined,
    },
    {
      label: "Duration",
      value: typeof summary.durationMs === "number" ? `${summary.durationMs} ms` : "",
      visible: typeof summary.durationMs === "number",
    },
    { label: "Started at", value: text(summary.startedAt), visible: !!summary.startedAt },
    { label: "Ended at", value: text(summary.completedAt), visible: !!summary.completedAt },
  ];
  return (
    <dl className="trace-summary">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}

function outcomeVariant(outcome: string): "default" | "success" | "warning" | "error" {
  if (outcome === "success") return "success";
  if (outcome === "timeout" || outcome === "cancelled") return "warning";
  return outcome === "" ? "default" : "error";
}
