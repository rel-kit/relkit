import { InspectorApiError, type InspectorObject } from "./api-types";

export const GET_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000] as const;

export function shouldRetry(method: string, error: unknown, attempt: number): boolean {
  if (method !== "GET" || attempt >= GET_RETRY_DELAYS_MS.length) return false;
  if (!(error instanceof InspectorApiError)) return false;
  return (
    error.code === "ZSYS_INSPECTOR_INVALID_RESPONSE" ||
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
    throw new InspectorApiError(
      "Inspector returned invalid JSON",
      "ZSYS_INSPECTOR_INVALID_RESPONSE",
    );
  }
}

export function errorCode(value: unknown): string | undefined {
  const object =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as InspectorObject)
      : undefined;
  return typeof object?.error === "string" ? object.error : undefined;
}
