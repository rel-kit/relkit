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
  return (
    <form
      aria-label="Run filters"
      className="panel grid gap-3 md:grid-cols-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <label>
        Status
        <select aria-label="Run status" onChange={update(setStatus)} value={status}>
          <option value="">All statuses</option>
          {RUN_STATES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Jobs service
        <input aria-label="Jobs service" onChange={update(setService)} value={service} />
      </label>
      <label>
        Job ID or name
        <input aria-label="Job ID or name" onChange={update(setJobId)} value={jobId} />
      </label>
      <label>
        Run ID
        <input aria-label="Run ID" onChange={update(setRunId)} value={runId} />
      </label>
      <label>
        Accepted after
        <input
          aria-label="Accepted after"
          onChange={update(setAcceptedFrom)}
          type="datetime-local"
          value={acceptedFrom}
        />
      </label>
      <label>
        Accepted before
        <input
          aria-label="Accepted before"
          onChange={update(setAcceptedTo)}
          type="datetime-local"
          value={acceptedTo}
        />
      </label>
    </form>
  );
}
