import type { WaterfallSpan } from "../lib/observability-model";
import { SourceLink } from "./source-link";

export function detailTabs(span: WaterfallSpan) {
  return [
    {
      id: "io",
      label: "Input & output",
      content: <TraceIoDetail span={span} />,
    },
    {
      id: "summary",
      label: "Summary",
      content: (
        <dl className="identity-grid">
          <div>
            <dt>Name / type</dt>
            <dd>
              {span.name} · {span.operationType}
              {span.name.startsWith("relkit.middleware.") ? " · inclusive duration" : ""}
            </dd>
          </div>
          <div>
            <dt>Trace ID</dt>
            <dd>{span.traceId || "Unavailable"}</dd>
          </div>
          <div>
            <dt>{span.recordType === "span" ? "Span ID" : "Record"}</dt>
            <dd>{span.spanId || `${span.recordType} · ${span.name}`}</dd>
          </div>
          <div>
            <dt>Parent</dt>
            <dd>{span.parentId ?? "Root"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{span.outcome || span.status || "recorded"}</dd>
          </div>
          <div>
            <dt>Started / completed</dt>
            <dd>
              {span.startedAt ?? "Unavailable"} → {span.completedAt ?? "In progress"}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(span.durationMs)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <SourceLink source={span.details.source} />
            </dd>
          </div>
        </dl>
      ),
    },
    {
      id: "metadata",
      label: "Metadata",
      content: (
        <SafeDetail
          value={{
            attributes: span.details.metadata,
            resourceAttributes: span.details.resourceAttributes,
            dropped: span.details.dropped,
          }}
        />
      ),
    },
    { id: "events", label: "Events", content: <SafeDetail value={span.details.events} /> },
    { id: "links", label: "Links", content: <LinksDetail value={span.details.links} /> },
    { id: "logs", label: "Logs", content: <SafeDetail value={span.details.logs} /> },
    { id: "error", label: "Error", content: <SafeDetail value={span.details.error} /> },
  ];
}

function TraceIoDetail({ span }: { readonly span: WaterfallSpan }) {
  return (
    <div className="trace-io-detail">
      <DetailSection
        title="Input"
        description="Captured request or operation input fields."
        value={span.details.input}
        empty={captureEmpty("Input", span.details.inputCapture)}
      />
      <DetailSection
        title="Output"
        description="Captured response or result fields."
        value={span.details.output}
        empty={captureEmpty("Output", span.details.outputCapture)}
      />
      <DetailSection
        title="Outcome"
        description="Execution status is separate from the returned output."
        value={{
          status: span.status,
          outcome: span.outcome,
          duration: duration(span.durationMs),
          error: span.details.error,
        }}
        empty="This span is still in progress."
      />
      <p className="supporting-copy">
        RELKIT shows only explicitly captured, redacted fields and never infers missing values.
      </p>
    </div>
  );
}

function DetailSection({
  title,
  description,
  value,
  empty,
}: {
  readonly title: string;
  readonly description: string;
  readonly value: unknown;
  readonly empty: string;
}) {
  return (
    <section className="trace-detail-section">
      <h3>{title}</h3>
      <p>{description}</p>
      <SafeDetail value={value} empty={empty} />
    </section>
  );
}

function LinksDetail({ value }: { readonly value: unknown }) {
  if (!Array.isArray(value) || value.length === 0)
    return <p className="supporting-copy">No retained data.</p>;
  return (
    <ul className="request-list">
      {value.map((item, index) => {
        const link = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const traceId = typeof link.traceId === "string" ? link.traceId : "";
        return (
          <li className="request-row" key={`${traceId}:${index}`}>
            <SafeDetail value={item} />
            {traceId && (
              <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
                Open linked trace →
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SafeDetail({
  value,
  empty = "No retained data.",
}: {
  readonly value: unknown;
  readonly empty?: string;
}) {
  return isEmpty(value) ? (
    <p className="schema-empty">{empty}</p>
  ) : (
    <pre className="safe-json">{JSON.stringify(value, null, 2)}</pre>
  );
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (value !== null && typeof value === "object" && Object.keys(value).length === 0)
  );
}

function captureEmpty(label: "Input" | "Output", value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `${label} capture is disabled for this telemetry configuration.`;
  }
  const capture = value as Record<string, unknown>;
  if (capture.truncated === true) {
    const bytes =
      typeof capture.bytes === "number" ? capture.bytes.toLocaleString("en-US") : "configured";
    return `${label} exceeded the ${bytes}-byte capture limit.`;
  }
  return label === "Output" ? "No value was returned." : "No input value was provided.";
}

export function duration(value: number | undefined): string {
  return value === undefined ? "duration unavailable" : `${value.toLocaleString("en-US")} ms`;
}
