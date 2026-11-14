"use client";

import type { ReactNode } from "react";
import type { FilterProblem } from "../lib/request-filters";
import type { SignalFilters } from "../lib/observability-model";

export const controlClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-[invalid=true]:border-danger";

export const labelClass =
  "flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-3";

interface FieldProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly name: keyof SignalFilters;
  readonly value: string;
  readonly onChange: (name: keyof SignalFilters, value: string) => void;
  /** The message to show at this field, when the value is not accepted. */
  readonly problem?: FilterProblem | undefined;
  readonly hint?: string;
}

/** A labelled text or date-time input; a problem shows under it and names it for assistive tech. */
export function Field({
  label,
  icon,
  name,
  value,
  type = "text",
  onChange,
  problem,
  hint,
}: FieldProps & { readonly type?: "text" | "datetime-local" }) {
  const base = `signal-filter-${name}`;
  return (
    <div className="grid min-w-0 content-start gap-1">
      <label id={`${base}-label`} htmlFor={base} className={labelClass}>
        {icon} {label}
      </label>
      <input
        id={base}
        name={name}
        type={type}
        value={value}
        autoComplete="off"
        spellCheck={false}
        placeholder={hint}
        className={`${controlClass} ${type === "text" ? "font-mono" : ""}`}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${base}-error` : undefined}
        onChange={(event) => onChange(name, event.target.value)}
      />
      <Problem id={`${base}-error`} problem={problem} />
    </div>
  );
}

/** A labelled choice with an "all" entry first; a value outside the list stays selectable. */
export function SelectField({
  label,
  icon,
  name,
  value,
  allLabel,
  options,
  onChange,
  problem,
}: FieldProps & {
  readonly allLabel: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  const base = `signal-filter-${name}`;
  const known = value === "" || options.some((option) => option.value === value);
  return (
    <div className="grid min-w-0 content-start gap-1">
      <label id={`${base}-label`} htmlFor={base} className={labelClass}>
        {icon} {label}
      </label>
      <select
        id={base}
        name={name}
        className={controlClass}
        value={value}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${base}-error` : undefined}
        onChange={(event) => onChange(name, event.target.value)}
      >
        <option value="">{allLabel}</option>
        {known ? null : <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Problem id={`${base}-error`} problem={problem} />
    </div>
  );
}

function Problem({
  id,
  problem,
}: {
  readonly id: string;
  readonly problem?: FilterProblem | undefined;
}) {
  return problem ? (
    <p id={id} className="m-0 text-[11px] text-danger">
      {problem.message}
    </p>
  ) : null;
}
