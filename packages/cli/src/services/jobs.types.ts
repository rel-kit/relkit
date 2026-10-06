import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type {
  JobsManifestView,
  JobsRequestOptions,
  JobsWatchContext,
  ParsedJobs,
} from "../commands/jobs.types.js";

/** Narrow jobs domain; finite requests and watch streams own their operation scopes. */
export interface JobsOperations {
  /**
   * Sends one existing REST control/read operation.
   * @param parsed - Existing normalized filters.
   * @param method - Declared HTTP method.
   * @param path - Encoded selected endpoint.
   * @param options - Original body/cancellation policy.
   * @returns Lazy untrusted public result without mutation retries.
   */
  readonly request: (
    parsed: ParsedJobs,
    method: "GET" | "POST" | "DELETE",
    path: string,
    options?: JobsRequestOptions,
  ) => Effect.Effect<unknown, CliAdapterError>;
  /**
   * Obtains original issued identity and visitor cookies.
   * @returns Lazy issued header projection.
   */
  readonly identity: () => Effect.Effect<Record<string, string>, CliAdapterError>;
  /**
   * Reads one authorized JSON input.
   * @param root - Explicit project root.
   * @param path - Existing relative/absolute input path.
   * @returns Untrusted decoded JSON.
   */
  readonly jsonFile: (root: string, path: string) => Effect.Effect<unknown, CliAdapterError>;
  /**
   * Reads the optional compiler-owned manifest projection.
   * @param root - Explicit project root.
   * @returns Accepted projection or the existing undefined fallback.
   */
  readonly manifest: (root: string) => Effect.Effect<JobsManifestView | undefined>;
  /**
   * Resolves and submits one job mutation exactly once.
   * @param parsed - Existing operation and idempotency identifiers.
   * @param signal - Caller cancellation.
   * @returns Original native outcome after physical completion.
   */
  readonly trigger: (
    parsed: ParsedJobs,
    signal: AbortSignal,
  ) => Effect.Effect<unknown, CliAdapterError>;
  /**
   * Streams original projected frames and releases its iterator once.
   * @param parsed - Existing run locator and resume cursor.
   * @param context - Original reporter and caller cancellation.
   * @returns Completion after physical release, preserving primary failure evidence.
   */
  readonly watch: (
    parsed: ParsedJobs,
    context: JobsWatchContext,
  ) => Effect.Effect<void, CliAdapterError>;
}
