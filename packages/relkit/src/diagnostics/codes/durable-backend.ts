/** Codes reported by the durable Postgres backend for jobs, events and schedules. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const durableBackendCodes = [
  {
    code: "RELKIT_BUILD_LOCAL_DURABLE_PROVIDER",
    title: "Production build uses the local provider for durable work",
    happened:
      "`relkit build` found jobs, schedules or events whose profile uses the local filesystem provider, which keeps their state in `.relkit/state` on one machine. A production instance loses that state on redeploy and does not share it with other instances.",
    fix: "Select a durable provider for the profile, for example with `relkit add jobs --provider postgres` or `relkit add events --provider postgres`. The build still succeeds; this is a warning.",
  },
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
