import { Effect } from "effect";
import { CliJobs, jobsLiveLayer } from "../services/jobs.service.js";
import { runCliEffect } from "../cli-runtime.js";
import type { JobsRequestOptions, ParsedJobs } from "./jobs.types.js";
export type { JobsRequestOptions } from "./jobs.types.js";
export { jobsBaseUrl } from "./jobs-base-url.js";

/**
 * Sends the existing public REST request through an invocation-owned jobs graph.
 * @param parsed - Existing normalized jobs query.
 * @param method - Declared HTTP method.
 * @param path - Existing encoded path.
 * @param options - Original body and cancellation settings.
 * @returns Original decoded public result after scoped HTTP cleanup.
 */
export function fetchJobsJson(
  parsed: ParsedJobs,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: JobsRequestOptions = {},
): Promise<unknown> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.request(parsed, method, path, options)),
    jobsLiveLayer(),
    options.signal,
  );
}

/**
 * Obtains existing backend-issued authentication headers at the Promise edge.
 * @param signal - Optional caller cancellation.
 * @returns Original identity headers and visitor cookies.
 */
export function jobsIdentityHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.identity()),
    jobsLiveLayer(),
    signal,
  );
}

/**
 * Reads an authorized JSON input through explicit filesystem authority.
 * @param projectRoot - Existing explicit project root.
 * @param path - Existing authorized relative or absolute path.
 * @returns Original parsed unknown JSON.
 */
export function readJobsJsonFile(projectRoot: string, path: string): Promise<unknown> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.jsonFile(projectRoot, path)),
    jobsLiveLayer(),
  );
}
