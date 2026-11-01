"use client";

import type { ReactNode } from "react";
import type { SignalFilters, SignalKind } from "../lib/observability-model";
import { Button } from "../components/ui/button";
import {
  Activity,
  CalendarClock,
  Code2,
  Fingerprint,
  GitBranch,
  ListFilter,
  Route,
  RotateCcw,
} from "lucide-react";

interface SignalsFiltersProps {
  readonly kind: SignalKind;
  readonly value: SignalFilters;
  readonly limit: number;
  readonly onChange: (value: SignalFilters) => void;
  readonly onLimitChange: (value: number) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
}

const control =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

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
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="signal-filter-heading"
      aria-describedby="signal-filter-description"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h2 id="signal-filter-heading" className="text-[13px] font-semibold text-foreground">
            {title}
          </h2>
          <p id="signal-filter-description" className="text-xs text-muted-foreground">
            Filters are applied by the versioned backend. Bodies, cookies, secrets, and provider
            data are never requested.
          </p>
        </div>
        <span className="rounded-sm border border-border/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          Redacted API
        </span>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="From"
          icon={<CalendarClock aria-hidden="true" />}
          name="from"
          value={value.from}
          type="datetime-local"
          onChange={update}
        />
        <Field
          label="To"
          icon={<CalendarClock aria-hidden="true" />}
          name="to"
          value={value.to}
          type="datetime-local"
          onChange={update}
        />
        <Field
          label="Route ID"
          icon={<Route aria-hidden="true" />}
          name="routeId"
          value={value.routeId}
          onChange={update}
        />
        <Field
          label="Function ID"
          icon={<Code2 aria-hidden="true" />}
          name="functionId"
          value={value.functionId}
          onChange={update}
        />
        <Field
          label="Request ID"
          icon={<Fingerprint aria-hidden="true" />}
          name="requestId"
          value={value.requestId}
          onChange={update}
        />
        <Field
          label="Trace ID"
          icon={<GitBranch aria-hidden="true" />}
          name="traceId"
          value={value.traceId}
          onChange={update}
        />
        <Field
          label="Service ID"
          icon={<Activity aria-hidden="true" />}
          name="serviceId"
          value={value.serviceId}
          onChange={update}
        />
        <Field
          label="Outcome"
          icon={<ListFilter aria-hidden="true" />}
          name="outcome"
          value={value.outcome}
          onChange={update}
        />
        {kind === "logs" && (
          <label className="grid min-w-0 gap-1">
            <span id="signal-filter-severity-label" className={labelClass}>
              <ListFilter aria-hidden="true" /> Severity
            </span>
            <select
              id="signal-filter-severity"
              name="severity"
              aria-labelledby="signal-filter-severity-label"
              className={control}
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
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <label className="flex items-center gap-2">
          <span id="signal-filter-limit-label" className={labelClass}>
            <ListFilter aria-hidden="true" /> Page size
          </span>
          <select
            id="signal-filter-limit"
            name="limit"
            aria-labelledby="signal-filter-limit-label"
            className={`${control} w-20`}
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" type="button" onPress={onReset}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </footer>
    </form>
  );
}

const labelClass =
  "flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-3";

function Field({
  label,
  icon,
  name,
  value,
  type = "text",
  onChange,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly name: keyof SignalFilters;
  readonly value: string;
  readonly type?: "text" | "datetime-local";
  readonly onChange: (name: keyof SignalFilters, value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span id={`signal-filter-${name}-label`} className={labelClass}>
        {icon} {label}
      </span>
      <input
        id={`signal-filter-${name}`}
        name={name}
        type={type}
        value={value}
        autoComplete="off"
        spellCheck={false}
        className={`${control} ${type === "text" ? "font-mono" : ""}`}
        aria-labelledby={`signal-filter-${name}-label`}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}
