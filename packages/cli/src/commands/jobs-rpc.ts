import { CliJobs, jobsLiveLayer } from "../services/jobs.service.js";
import { runCliEffect } from "../cli-runtime.js";
import type { JobsWatchContext, ParsedJobs } from "./jobs.types.js";

/**
 * Submits the existing native job mutation through one owned jobs graph.
 * @param parsed - Existing operation and idempotency identifiers.
 * @param signal - Caller cancellation.
 * @returns Original native result without mutation retries.
 */
export function triggerJob(parsed: ParsedJobs, signal: AbortSignal): Promise<unknown> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.trigger(parsed, signal)),
    jobsLiveLayer(),
    signal,
  );
}

/**
 * Streams projected watch frames through one iterator lifetime owner.
 * @param parsed - Existing run locator and resume cursor.
 * @param context - Original reporter and caller cancellation.
 * @returns Completion after physical native iterator release.
 */
export function watchJob(parsed: ParsedJobs, context: JobsWatchContext): Promise<void> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.watch(parsed, context)),
    jobsLiveLayer(),
    context.signal,
  );
}
