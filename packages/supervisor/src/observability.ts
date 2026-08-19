import { admitObservabilityRecord, type ObservabilityRecord } from "@zsys/observability";
import { recordsForTelemetry } from "./observability-records.js";
import type { SupervisorCandidateToken, SupervisorTelemetry } from "./state-machine-types.js";
import type {
  SupervisorGraphHash,
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability-types.js";

export type {
  SupervisorGraphHash,
  SupervisorObservability,
  SupervisorObservabilityOptions,
} from "./observability-types.js";

/** Bridges supervisor lifecycle outcomes into the existing redacted observability sinks. */
export function createSupervisorObservability(
  options: SupervisorObservabilityOptions,
): SupervisorObservability {
  const now = options.now ?? Date.now;
  let tail = Promise.resolve();
  const resolveHash = createHashResolver(options.graphHash);

  const emit = (event: SupervisorTelemetry): void => {
    const records = recordsForTelemetry(event, (token) => resolveHash(token, event), now);
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

function createHashResolver(
  value: SupervisorGraphHash,
): (token: SupervisorCandidateToken, event: SupervisorTelemetry) => string {
  return (token, event) => {
    const hash = typeof value === "string" ? value : value(token, event);
    if (hash === undefined || hash.trim() === "")
      throw new TypeError(
        `Supervisor observability requires an explicit graph hash for generation-${token.generationToken}.`,
      );
    return hash;
  };
}
