import { InspectorApiError, type InspectorObject } from "./api-types";

export const GET_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000] as const;

export function shouldRetry(method: string, error: unknown, attempt: number): boolean {
  if (method !== "GET" || attempt >= GET_RETRY_DELAYS_MS.length) return false;
  if (!(error instanceof InspectorApiError)) return false;
  if (error.code === "RELKIT_INSPECTOR_JOBS_UNAVAILABLE") return false;
  return (
    error.code === "RELKIT_INSPECTOR_INVALID_RESPONSE" ||
    (error.status !== undefined && error.status >= 500)
  );
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A non-JSON error (e.g. a router's plain-text 404 for an unmounted route) keeps its status
    // so callers can tell "not mounted" apart from a corrupt reply, and 4xx stays non-retryable.
    if (!response.ok)
      throw new InspectorApiError(
        `HTTP_${response.status}`,
        `HTTP_${response.status}`,
        response.status,
      );
    throw new InspectorApiError(
      "Inspector returned invalid JSON",
      "RELKIT_INSPECTOR_INVALID_RESPONSE",
    );
  }
}

export const NO_JOBS_MESSAGE = "This application defines no jobs.";

/**
 * Jobs routes are mounted only when the application declares jobs, so a list
 * endpoint answering with a bare 404 means "no jobs", not an outage.
 */
export function jobsNotMounted(error: unknown): boolean {
  return error instanceof InspectorApiError && error.code === "HTTP_404";
}

export function errorCode(value: unknown): string | undefined {
  const object =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as InspectorObject)
      : undefined;
  return typeof object?.error === "string" ? object.error : undefined;
}
