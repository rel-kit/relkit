"use client";

import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  CalendarClock,
  Code2,
  Fingerprint,
  GitBranch,
  ListFilter,
  RotateCcw,
  Route,
  Search,
  Slash,
  TriangleAlert,
} from "lucide-react";
import { SegmentedFilter } from "../components/neon/history-list";
import { Button } from "../components/ui/button";
import type { SignalFilters } from "../lib/observability-model";
import { REQUEST_OUTCOME_OPTIONS, type FilterProblem } from "../lib/request-filters";
import { PAGE_SIZES } from "../lib/requests-url";
import { controlClass, Field, labelClass, SelectField } from "./signals-filter-fields";

interface SignalsFiltersProps {
  readonly value: SignalFilters;
  readonly limit: number;
  /** Problems with the typed values, shown at their fields. */
  readonly problems: readonly FilterProblem[];
  /** A message about the whole filter set, for example when the Inspector rejected it. */
  readonly rejected?: string | undefined;
  readonly onChange: (value: SignalFilters) => void;
  readonly onLimitChange: (value: number) => void;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
  /** Applies a status quick choice at once, together with the other typed filters. */
  readonly onStatus: (status: string) => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((value) => ({
  value,
  label: value,
}));
type StatusChoice = "all" | "2xx" | "4xx" | "5xx" | "exact";
const STATUS_CHOICES: readonly { readonly value: StatusChoice; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "2xx", label: "2xx" },
  { value: "4xx", label: "4xx" },
  { value: "5xx", label: "5xx" },
];

/** The quick choice a status value stands for; an exact code or a typo matches none. */
function statusChoice(status: string): StatusChoice {
  if (status === "") return "all";
  return status === "2xx" || status === "4xx" || status === "5xx" ? status : "exact";
}

/** Filters of the Requests page: quick status choices, the common fields, and the rest. */
export function SignalsFilters({
  value,
  limit,
  problems,
  rejected,
  onChange,
  onLimitChange,
  onSubmit,
  onReset,
  onStatus,
}: SignalsFiltersProps) {
  const update = (name: keyof SignalFilters, next: string): void =>
    onChange({ ...value, [name]: next });
  const problem = (name: keyof SignalFilters) => problems.find((item) => item.field === name);
  const field = (name: keyof SignalFilters, label: string, icon: ReactNode, hint?: string) => (
    <Field
      label={label}
      icon={icon}
      name={name}
      value={value[name]}
      onChange={update}
      problem={problem(name)}
      {...(hint === undefined ? {} : { hint })}
    />
  );
  const moreActive = [
    value.errorId,
    value.routeId,
    value.functionId,
    value.requestId,
    value.traceId,
    value.serviceId,
    value.from,
    value.to,
  ].some((item) => item !== "");
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
            Request filters
          </h2>
          <p id="signal-filter-description" className="text-xs text-muted-foreground">
            Filters run on every retained request, not only the page you see. Bodies, cookies,
            secrets and provider data are never requested.
          </p>
        </div>
        <SegmentedFilter
          label="Status class"
          options={STATUS_CHOICES}
          value={statusChoice(value.status)}
          onChange={(choice) => onStatus(choice === "all" ? "" : choice)}
        />
      </header>
      {rejected ? (
        <p role="alert" className="m-0 border-b border-border px-4 py-2 text-xs text-danger">
          {rejected}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {field("status", "Status", <Activity aria-hidden="true" />, "404 or 4xx")}
        <SelectField
          label="Method"
          icon={<ArrowLeftRight aria-hidden="true" />}
          name="method"
          value={value.method}
          allLabel="All methods"
          options={METHODS}
          onChange={update}
          problem={problem("method")}
        />
        {field("path", "Path starts with", <Slash aria-hidden="true" />, "/orders")}
        {field("search", "Search", <Search aria-hidden="true" />, "Text in any recorded field")}
        <SelectField
          label="Outcome"
          icon={<ListFilter aria-hidden="true" />}
          name="outcome"
          value={value.outcome}
          allLabel="All outcomes"
          options={REQUEST_OUTCOME_OPTIONS}
          onChange={update}
        />
      </div>
      <details className="border-t border-border px-4 py-2" open={moreActive || undefined}>
        <summary className="cursor-pointer text-xs text-muted-foreground">More filters</summary>
        <div className="grid grid-cols-1 gap-3 pt-3 pb-2 sm:grid-cols-2 lg:grid-cols-4">
          {field("errorId", "Error ID", <TriangleAlert aria-hidden="true" />, "fleet.plate-taken")}
          {field("routeId", "Route ID", <Route aria-hidden="true" />)}
          {field("functionId", "Function ID", <Code2 aria-hidden="true" />)}
          {field("requestId", "Request ID", <Fingerprint aria-hidden="true" />)}
          {field("traceId", "Trace ID", <GitBranch aria-hidden="true" />)}
          {field("serviceId", "Service ID", <Activity aria-hidden="true" />)}
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
        </div>
      </details>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <label htmlFor="signal-filter-limit" className={labelClass}>
            <ListFilter aria-hidden="true" /> Page size
          </label>
          <select
            id="signal-filter-limit"
            name="limit"
            className={`${controlClass} w-20`}
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
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
