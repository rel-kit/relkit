import { isRuntimeActivationFingerprint } from "@relkit/contracts";
import { admitObservabilityRecord, type ObservabilityRecord } from "@relkit/observability";
import { recordsForTelemetry } from "./observability-records.js";
import type { SupervisorCandidateToken, SupervisorTelemetry } from "./state-machine-types.js";
import type {
  SupervisorActivationFingerprint,
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability-types.js";

export type {
  SupervisorActivationFingerprint,
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability-types.js";

/** Bridges supervisor lifecycle outcomes into the existing redacted observability sinks. */
export function createSupervisorObservability(
  options: SupervisorObservabilityOptions,
): SupervisorObservability {
  const now = options.now ?? Date.now;
  let tail = Promise.resolve();
  const resolveFingerprint = createFingerprintResolver(options.activationFingerprint);

  const emit = (event: SupervisorTelemetry): void => {
    const records = recordsForTelemetry(event, (token) => resolveFingerprint(token, event), now);
    for (const item of records) publish(item.record, item.streamType);
  };

  const publish = (
    record: ObservabilityRecord,
    streamType: "generation.changed" | "diagnostic.changed",
  ): void => {
    const safe = admitObservabilityRecord(record, options.redaction);
    if (safe === undefined) return;
    try {
      options.collector?.collect(safe);
      options.stream?.publishRecord(streamType, safe);
    } catch {
      // A closed or bounded sink cannot change supervisor lifecycle behavior.
    }
    if (options.append !== undefined) {
      tail = tail
        .then(() => options.append!(safe))
        .then(
          () => undefined,
          () => undefined,
        );
    }
  };

  return Object.freeze({
    onTelemetry: emit,
    emit,
    flush: async () => {
      await tail;
    },
  });
}

function createFingerprintResolver(
  value: SupervisorActivationFingerprint,
): (
  token: SupervisorCandidateToken,
  event: SupervisorTelemetry,
) => import("@relkit/contracts").RuntimeActivationFingerprint {
  return (token, event) => {
    const fingerprint = typeof value === "function" ? value(token, event) : value;
    if (!isRuntimeActivationFingerprint(fingerprint))
      throw new TypeError(
        `Supervisor observability requires an activation fingerprint for generation-${token.generationToken}.`,
      );
    return fingerprint;
  };
}
