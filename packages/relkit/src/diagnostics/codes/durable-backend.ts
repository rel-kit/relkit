/** Codes reported by the durable Postgres backend for jobs, events and schedules. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const durableBackendCodes = [
  {
    code: "RELKIT_JOB_DEAD_LETTERED",
    title: "Job run moved to the dead-letter state",
    happened:
      "A job run failed on its last permitted attempt, or failed with an error that forbids retries, so the backend stopped retrying it and kept it as a failed run.",
    fix: "Read the run's error, fix the cause, then call `retry` on the run to start a new run from the same input.",
  },
  {
    code: "RELKIT_JOB_LEASE_EXPIRED",
    title: "Job worker lease expired on the last attempt",
    happened:
      "The worker running the job stopped renewing its lease, for example because the process crashed, and the run had no attempts left under its retry policy.",
    fix: "Find out why the worker stopped, raise the task's `retry.maxAttempts` if crashes are expected, and make the task idempotent because an attempt may have partly run.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
