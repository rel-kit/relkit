import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ParsedJobs } from "./jobs-support.js";
import { JobsCommandError } from "./jobs-support.js";

export interface JobsRequestOptions {
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export async function fetchJobsJson(
  parsed: ParsedJobs,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: JobsRequestOptions = {},
): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed.options)) {
    if (
      [
        "project-root",
        "input-file",
        "definition-file",
        "run-id",
        "schedule-id",
        "operation-id",
      ].includes(key)
    )
      continue;
    query.set(key, value);
  }
  for (const value of parsed.repeated.tag ?? []) query.append("tag", value);
  const base = `${jobsBaseUrl()}/_relkit/v1`;
  const url = `${base}${path}${query.size === 0 ? "" : `?${query}`}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET" || options.body !== undefined) {
    headers["content-type"] = "application/json";
    if (parsed.options["operation-id"] !== undefined)
      headers["x-relkit-operation-id"] = parsed.options["operation-id"];
  }
  const init: RequestInit = {
    method,
    headers,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const response = await fetch(url, init); // lgtm [js/request-forgery]
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new JobsCommandError(
      "RELKIT_JOBS_REQUEST_FAILED",
      `Jobs service returned ${response.status}.`,
    );
  return body;
}

export function jobsBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

export async function readJobsJsonFile(projectRoot: string, path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as unknown;
}
