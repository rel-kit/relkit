import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { RUN_STATES } from "../../../lib/jobs-model";

export function RunsFilters({
  status,
  service,
  jobId,
  runId,
  acceptedFrom,
  acceptedTo,
  setStatus,
  setService,
  setJobId,
  setRunId,
  setAcceptedFrom,
  setAcceptedTo,
  reset,
}: {
  readonly status: string;
  readonly service: string;
  readonly jobId: string;
  readonly runId: string;
  readonly acceptedFrom: string;
  readonly acceptedTo: string;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setService: Dispatch<SetStateAction<string>>;
  readonly setJobId: Dispatch<SetStateAction<string>>;
  readonly setRunId: Dispatch<SetStateAction<string>>;
  readonly setAcceptedFrom: Dispatch<SetStateAction<string>>;
  readonly setAcceptedTo: Dispatch<SetStateAction<string>>;
  readonly reset: () => void;
}) {
  const update =
    (setter: Dispatch<SetStateAction<string>>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
      setter(event.target.value);
      reset();
    };
  const control =
    "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";
  const labelClass =
    "grid min-w-0 gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase";
  return (
    <form
      aria-label="Run filters"
      className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className={labelClass}>
        Status
        <select
          aria-label="Run status"
          className={`${control} normal-case tracking-normal`}
          onChange={update(setStatus)}
          value={status}
        >
          <option value="">All statuses</option>
          {RUN_STATES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Jobs service
        <input
          aria-label="Jobs service"
          className={`${control} font-mono text-xs normal-case tracking-normal`}
          onChange={update(setService)}
          placeholder="any"
          value={service}
        />
      </label>
      <label className={labelClass}>
        Job ID or name
        <input
          aria-label="Job ID or name"
          className={`${control} font-mono text-xs normal-case tracking-normal`}
          onChange={update(setJobId)}
          placeholder="any"
          value={jobId}
        />
      </label>
      <label className={labelClass}>
        Run ID
        <input
          aria-label="Run ID"
          className={`${control} font-mono text-xs normal-case tracking-normal`}
          onChange={update(setRunId)}
          placeholder="exact id"
          value={runId}
        />
      </label>
      <label className={labelClass}>
        Accepted after
        <input
          aria-label="Accepted after"
          className={`${control} text-xs normal-case tracking-normal tabular-nums`}
          onChange={update(setAcceptedFrom)}
          type="datetime-local"
          value={acceptedFrom}
        />
      </label>
      <label className={labelClass}>
        Accepted before
        <input
          aria-label="Accepted before"
          className={`${control} text-xs normal-case tracking-normal tabular-nums`}
          onChange={update(setAcceptedTo)}
          type="datetime-local"
          value={acceptedTo}
        />
      </label>
    </form>
  );
}
