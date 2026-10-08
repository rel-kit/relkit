import { Effect, Schema } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliHttp } from "../services/http.service.js";
import { cliAdapterError } from "../cli-errors.js";
import { JobsCommandError } from "./jobs-error.js";
import { JobsIdentitySchema } from "./jobs.schemas.js";
import type { JobsRequestOptions, ParsedJobs } from "./jobs.types.js";

/**
 * Obtains backend-issued identity and visitor cookies through scoped HTTP authority.
 * @param baseUrl - Already validated loopback server URL.
 * @returns Original issued identity headers, without manufacturing credentials.
 */
export const jobsIdentityHeadersEffect = Effect.fn("Jobs.identity")(
  function* (baseUrl: string) {
    const http = yield* CliHttp;
    const response = yield* http.request(`${baseUrl}/_relkit/v1/client/identity`);
    if (!response.ok) return yield* Effect.fail(jobsFailure("Client identity is unavailable."));
    const value = yield* http.json(response, 1_048_576);
    if (!Schema.is(JobsIdentitySchema)(value))
      return yield* Effect.fail(jobsFailure("Client identity is invalid."));
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]);
    return {
      "x-relkit-identity-scope": value.identityScope,
      "x-relkit-session-epoch": value.sessionEpoch,
      "x-relkit-public-fingerprint": value.publicFingerprint,
      ...(cookies.length === 0 ? {} : { cookie: cookies.join("; ") }),
    };
  },
  (effect) => observeCli("jobs.identity.workflow", effect),
);

/**
 * Sends one REST control/read operation with bounded body ownership and no retries.
 * @param baseUrl - Validated loopback server URL.
 * @param parsed - Existing literal filters and operation identifiers.
 * @param method - Declared control/read method.
 * @param path - Encoded path selected by the jobs command.
 * @param options - Optional original body; cancellation belongs to the caller scope.
 * @returns Untrusted JSON for the established output projection.
 */
export const fetchJobsJsonEffect = Effect.fn("Jobs.request")(
  function* (
    baseUrl: string,
    parsed: ParsedJobs,
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: JobsRequestOptions = {},
  ) {
    const query = jobsQuery(parsed);
    const url = `${baseUrl}/_relkit/v1${path}${query.size === 0 ? "" : `?${query}`}`;
    const headers: Record<string, string> = { accept: "application/json" };
    if (path.startsWith("/jobs/runs") || path.startsWith("/jobs/schedules"))
      Object.assign(headers, yield* jobsIdentityHeadersEffect(baseUrl));
    if (method !== "GET" || options.body !== undefined) {
      headers["content-type"] = "application/json";
      if (parsed.options["operation-id"] !== undefined)
        headers["x-relkit-operation-id"] = parsed.options["operation-id"];
    }
    const http = yield* CliHttp;
    // codeql[js/request-forgery]
    const response = yield* http.request(url, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const body = yield* http
      .json(response, 1_048_576)
      .pipe(
        Effect.catchTag("CliAdapterError", (error) =>
          error.cause instanceof SyntaxError ? Effect.succeed({}) : Effect.fail(error),
        ),
      );
    if (!response.ok)
      return yield* Effect.fail(jobsFailure(`Jobs service returned ${response.status}.`));
    return body;
  },
  (effect) => observeCli("jobs.request.workflow", effect),
);

/**
 * Retains existing filtering, exclusion and repeated-tag ordering.
 * @param parsed - Existing normalized arguments.
 * @returns The unchanged request query.
 */
function jobsQuery(parsed: ParsedJobs): URLSearchParams {
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
  return query;
}

/**
 * Preserves the existing public protocol error as an internal adapter cause.
 * @param message - Existing protocol diagnostic.
 * @returns The typed failure preserving public constructor/code identity.
 */
function jobsFailure(message: string) {
  return cliAdapterError(
    "jobs.protocol",
    new JobsCommandError("RELKIT_JOBS_REQUEST_FAILED", message),
  );
}
