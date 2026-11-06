import { INSPECTOR_API_BASE, type InspectorObject } from "./api-types";
import type { InspectorApiClient } from "./api";

/** Generation identity every action names, so a stale page cannot act on a newer generation. */
export interface ActionIdentity {
  readonly generationId: string;
  readonly graphHash: string;
}

/** Action routes the event and job views call, relative to `/actions`. */
export type StartActionPath =
  | `events/${string}/publish`
  | `events/${string}/replay`
  | `events/${string}/retry`
  | `events/${string}/cancel`
  | `jobs/${string}/trigger`;

/**
 * Posts one Inspector action with a fresh idempotency key.
 * @param client - Inspector API client.
 * @param path - Action route relative to `/actions`, with the target already encoded.
 * @param identity - Generation the page was loaded from.
 * @param body - Action fields, such as `input` or `reason`.
 * @returns The action's JSON receipt.
 */
export function postInspectorAction(
  client: Pick<InspectorApiClient, "request">,
  path: StartActionPath,
  identity: ActionIdentity,
  body: Readonly<Record<string, unknown>> = {},
): Promise<InspectorObject> {
  const idempotencyKey = crypto.randomUUID();
  return client.request<InspectorObject>(`${INSPECTOR_API_BASE}/actions/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ ...identity, idempotencyKey, ...body }),
    cacheTags: ["events", "jobs", "runtime"],
  });
}

/**
 * Builds an action route segment for one target.
 * @param kind - `events` or `jobs`.
 * @param id - Target ID, encoded here.
 * @param action - Action name.
 * @returns The route relative to `/actions`.
 */
export function actionPath(
  kind: "events" | "jobs",
  id: string,
  action: "publish" | "replay" | "retry" | "cancel" | "trigger",
): StartActionPath {
  return `${kind}/${encodeURIComponent(id)}/${action}` as StartActionPath;
}

/**
 * Parses a JSON text field.
 * @param text - Text the developer typed.
 * @returns The value, or an error message for invalid JSON.
 */
export function parseJsonInput(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } {
  try {
    return { ok: true, value: text.trim() === "" ? null : (JSON.parse(text) as unknown) };
  } catch {
    return { ok: false, error: "Enter valid JSON." };
  }
}

/**
 * Reads the run ID a trigger receipt names.
 * @param receipt - Action response.
 * @returns The run's instance ID when present.
 */
export function triggeredRunId(receipt: InspectorObject): string | undefined {
  const result = receipt.result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as InspectorObject;
  for (const key of ["instanceId", "runId", "id"])
    if (typeof record[key] === "string" && record[key] !== "") return record[key] as string;
  return undefined;
}

/**
 * Turns a failed action into a sentence for the status line.
 * @param error - Thrown request failure.
 * @returns The coded message the API returned, or a generic one.
 */
export function actionFailure(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "The action failed.";
}
