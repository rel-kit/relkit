import {
  OBSERVABILITY_MODEL_VERSION,
  type DiagnosticRecord,
  type GenerationEvent,
  type GenerationRecord,
} from "@relkit/observability";
import type {
  SupervisorCandidateToken,
  SupervisorOutcomeTelemetry,
  SupervisorTelemetry,
} from "./state-machine-types.js";

export interface SupervisorTelemetryRecord {
  readonly record: GenerationRecord | DiagnosticRecord;
  readonly streamType: "generation.changed" | "diagnostic.changed";
}

export function recordsForTelemetry(
  event: SupervisorTelemetry,
  graphHash: (token: SupervisorCandidateToken) => string,
  now: () => number,
): readonly SupervisorTelemetryRecord[] {
  if (event.type !== "outcome") return [];
  const occurredAt = new Date(now()).toISOString();
  const target = event.phase === "drain" ? event.previousGeneration : undefined;
  const token = target ?? tokenFor(event);
  const hash = graphHash(token);
  const generationId = generationIdFor(token);
  const lifecycle = lifecycleFor(event);
  const generation: GenerationRecord = {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "generation",
    generationId,
    graphHash: hash,
    event: lifecycle,
    occurredAt,
    sourceVersion: token.sourceToken,
    ...(event.error?.code === undefined ? {} : { errorCode: event.error.code }),
  };
  const diagnostic: DiagnosticRecord = {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "diagnostic",
    code:
      event.error?.code ?? `RELKIT_SUPERVISOR_${event.outcome.toUpperCase().replaceAll("-", "_")}`,
    severity:
      event.outcome === "candidate-stale" ? "warning" : lifecycle === "failed" ? "error" : "info",
    message: event.error?.message ?? `Supervisor ${event.phase} ${event.outcome}.`,
    occurredAt,
    generationId,
    graphHash: hash,
  };
  const result: SupervisorTelemetryRecord[] = [
    { record: generation, streamType: "generation.changed" },
    { record: diagnostic, streamType: "diagnostic.changed" },
  ];
  if (event.outcome === "switch-succeeded" && event.previousGeneration !== undefined) {
    const previous = event.previousGeneration;
    result.unshift({
      streamType: "generation.changed",
      record: {
        version: OBSERVABILITY_MODEL_VERSION,
        signal: "generation",
        generationId: generationIdFor(previous),
        graphHash: graphHash(previous),
        event: "draining",
        occurredAt,
        sourceVersion: previous.sourceToken,
      },
    });
  }
  return Object.freeze(result);
}

export function generationIdFor(token: SupervisorCandidateToken): string {
  return `generation-${token.generationToken}`;
}

function tokenFor(event: SupervisorOutcomeTelemetry): SupervisorCandidateToken {
  return { sourceToken: event.sourceToken, generationToken: event.generationToken };
}

function lifecycleFor(event: SupervisorOutcomeTelemetry): GenerationEvent {
  if (event.phase === "compile")
    return event.outcome === "compile-succeeded" ? "created" : "failed";
  if (event.phase === "start") return event.outcome === "start-succeeded" ? "started" : "failed";
  if (event.phase === "verification")
    return event.outcome === "verification-succeeded" ? "ready" : "failed";
  if (event.phase === "switch")
    return event.outcome === "switch-succeeded" ? "activated" : "failed";
  if (event.outcome === "drain-succeeded") return "stopped";
  return "failed";
}
