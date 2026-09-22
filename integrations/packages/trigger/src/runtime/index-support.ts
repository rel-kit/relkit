import { durationToMillis, type JobsServiceOptions } from "@relkit/jobs";
import type { NativeControlReceipt } from "@relkit/jobs/adapter";
import type { TriggerObservationOptions } from "./subscription.js";
import type { TriggerRuntimeOptions } from "./index.js";

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(label + " is invalid");
  return value;
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function url(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new TypeError("Trigger baseUrl is invalid");
}

export function unknown(value: NativeControlReceipt): boolean {
  return "outcome" in value && value.outcome === "unknown";
}

export function observationOptions(options: TriggerRuntimeOptions): TriggerObservationOptions {
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
    ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }),
  });
}
