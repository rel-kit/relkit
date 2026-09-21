import { durationToMillis, type JobsServiceOptions } from "@relkit/jobs";
import type { NativeReceipt, NativeSubmission } from "@relkit/jobs/adapter";
import type { InngestRuntimeOptions } from "./index.js";

export function eventNameFor(request: NativeSubmission): string {
  return ["relkit", request.jobId, request.taskId, request.taskVersion, request.buildId]
    .map(segment)
    .join("/");
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(`${label} is invalid`);
  return value;
}

export function url(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new TypeError("Inngest baseUrl is invalid");
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function eventIdFrom(value: unknown, fallback: string): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const ids = (value as { readonly ids?: unknown }).ids;
    if (Array.isArray(ids) && ids.length === 1 && typeof ids[0] === "string" && ids[0] !== "") {
      return ids[0];
    }
  }
  return fallback;
}

function segment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}

export function duplicateReceipt(value: NativeReceipt): NativeReceipt {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.hasOwn(value, "accepted") &&
    (value as { readonly accepted?: unknown }).accepted === true
    ? Object.freeze({ ...value, duplicate: true })
    : value;
}

export function observationOptions(
  options: InngestRuntimeOptions,
): Readonly<Record<string, number>> {
  const serviceObservation: JobsServiceOptions["observation"] = options.serviceOptions?.observation;
  return Object.freeze({
    ...(options.pollIntervalMs === undefined && serviceObservation?.pollInterval === undefined
      ? {}
      : {
          pollIntervalMs:
            options.pollIntervalMs ?? durationToMillis(serviceObservation!.pollInterval!),
        }),
    ...(serviceObservation?.readTimeout === undefined
      ? {}
      : { readTimeoutMs: durationToMillis(serviceObservation.readTimeout) }),
  });
}
