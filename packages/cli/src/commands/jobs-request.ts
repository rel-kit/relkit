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
  if (path.startsWith("/jobs/runs") || path.startsWith("/jobs/schedules"))
    Object.assign(headers, await jobsIdentityHeaders(options.signal));
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
  // codeql[js/request-forgery]
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new JobsCommandError(
      "RELKIT_JOBS_REQUEST_FAILED",
      `Jobs service returned ${response.status}.`,
    );
  return body;
}

export async function jobsIdentityHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
  const response = await fetch(`${jobsBaseUrl()}/_relkit/v1/client/identity`, {
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok)
    throw new JobsCommandError("RELKIT_JOBS_REQUEST_FAILED", "Client identity is unavailable.");
  const identity = (await response.json()) as Record<string, unknown>;
  const { identityScope, sessionEpoch, publicFingerprint } = identity;
  if (
    typeof identityScope !== "string" ||
    typeof sessionEpoch !== "string" ||
    typeof publicFingerprint !== "string"
  )
    throw new JobsCommandError("RELKIT_JOBS_REQUEST_FAILED", "Client identity is invalid.");
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]);
  return {
    "x-relkit-identity-scope": identityScope,
    "x-relkit-session-epoch": sessionEpoch,
    "x-relkit-public-fingerprint": publicFingerprint,
    ...(cookies.length === 0 ? {} : { cookie: cookies.join("; ") }),
  };
}

export function jobsBaseUrl(environmentPort = process.env.PORT): string {
  const port = Number(environmentPort ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new JobsCommandError("RELKIT_JOBS_USAGE", "PORT must be a valid local server port.");
  }
  return `http://127.0.0.1:${port}`;
}

export async function readJobsJsonFile(projectRoot: string, path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as unknown;
}
