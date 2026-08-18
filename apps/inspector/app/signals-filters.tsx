"use client";

import type { SignalFilters, SignalKind } from "../lib/observability-model";

interface SignalsFiltersProps {
  readonly kind: SignalKind;
  readonly value: SignalFilters;
  readonly limit: number;
  readonly onChange: (value: SignalFilters) => void;
  readonly onLimitChange: (value: number) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
}

export function SignalsFilters({
  kind,
  value,
  limit,
  onChange,
  onLimitChange,
  onSubmit,
  onReset,
}: SignalsFiltersProps) {
  const update = (name: keyof SignalFilters, next: string): void =>
    onChange({ ...value, [name]: next });
  const title =
    kind === "requests" ? "Request filters" : kind === "logs" ? "Log filters" : "Trace filters";
  return (
    <form
      className="panel signal-filters"
      aria-labelledby="signal-filter-heading"
      aria-describedby="signal-filter-description"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">BOUNDED QUERY</p>
          <h2 id="signal-filter-heading">{title}</h2>
        </div>
        <span className="badge">Redacted API</span>
      </div>
      <p className="supporting-copy">
        <span id="signal-filter-description">
          Filters are applied by the versioned backend. Bodies, cookies, secrets, and provider data
          are never requested.
        </span>
      </p>
      <div className="signal-filter-grid">
        <Field
          label="From"
          name="from"
          value={value.from}
          type="datetime-local"
          onChange={update}
        />
        <Field label="To" name="to" value={value.to} type="datetime-local" onChange={update} />
        <Field label="Route ID" name="routeId" value={value.routeId} onChange={update} />
        <Field label="Function ID" name="functionId" value={value.functionId} onChange={update} />
        <Field label="Request ID" name="requestId" value={value.requestId} onChange={update} />
        <Field label="Trace ID" name="traceId" value={value.traceId} onChange={update} />
        <Field label="Outcome" name="outcome" value={value.outcome} onChange={update} />
        {kind === "logs" && (
          <label className="signal-filter-field">
            <span id="signal-filter-severity-label">Severity</span>
            <select
              id="signal-filter-severity"
              name="severity"
              aria-labelledby="signal-filter-severity-label"
              value={value.severity}
              onChange={(event) => update("severity", event.target.value)}
            >
              <option value="">All levels</option>
              <option value="trace">Trace</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
          </label>
        )}
        <label className="signal-filter-field">
          <span id="signal-filter-limit-label">Page size</span>
          <select
            id="signal-filter-limit"
            name="limit"
            aria-labelledby="signal-filter-limit-label"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>
      <div className="request-links">
        <button className="button-link" type="submit">
          Apply filters
        </button>
        <button className="button-link" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  onChange,
}: {
  readonly label: string;
  readonly name: keyof SignalFilters;
  readonly value: string;
  readonly type?: "text" | "datetime-local";
  readonly onChange: (name: keyof SignalFilters, value: string) => void;
}) {
  return (
    <label className="signal-filter-field">
      <span id={`signal-filter-${name}-label`}>{label}</span>
      <input
        id={`signal-filter-${name}`}
        name={name}
        type={type}
        value={value}
        aria-labelledby={`signal-filter-${name}-label`}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}
