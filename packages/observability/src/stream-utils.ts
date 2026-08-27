import {
  OBSERVABILITY_STREAM_EVENT_TYPES,
  ObservabilityStreamError,
  type ObservabilityStreamEventType,
} from "./stream-types.js";

export function resolveCursor(value: {
  readonly cursor?: string;
  readonly afterCursor?: string;
}): string | undefined {
  if (
    value.cursor !== undefined &&
    value.afterCursor !== undefined &&
    value.cursor !== value.afterCursor
  )
    throw invalid("cursor and afterCursor disagree");
  return value.cursor ?? value.afterCursor;
}

export function validateCursor(value: string, latest: number, earliest?: string): void {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw invalid("stream cursor is invalid");
  const cursor = Number(value);
  if (cursor > latest)
    throw new ObservabilityStreamError(
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE",
      "Stream cursor is ahead of the retained stream",
    );
  if (earliest !== undefined && cursor < Number(earliest) - 1)
    throw new ObservabilityStreamError(
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED",
      "Stream cursor is older than retained events",
    );
}

export function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid(`stream ${name} bound is invalid`);
  return value;
}
export function bounded(value: number, maximum: number, name: string): number {
  return Math.min(positive(value, name), maximum);
}
export function assertType(value: string): asserts value is ObservabilityStreamEventType {
  if (!(OBSERVABILITY_STREAM_EVENT_TYPES as readonly string[]).includes(value))
    throw invalid("stream event type is invalid");
}
export function invalid(message: string): ObservabilityStreamError {
  return new ObservabilityStreamError("RELKIT_OBSERVABILITY_STREAM_INVALID", message);
}
