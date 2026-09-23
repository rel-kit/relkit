import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import type { TraceId } from "./id.types.js";
import { isSpanIdEffect, isTraceIdEffect, type SpanContext, type TracePropagation } from "./trace-context.js";
import type { SpanId } from "./trace-context.types.js";

/**
 * Parses W3C traceparent metadata, ignoring invalid remote values.
 * @param value - Candidate traceparent header.
 * @param traceState - Optional tracestate header.
 * @returns An Effect containing a remote span context or undefined.
 * @example Effect.runSync(parseTraceParentEffect("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"));
 */
export function parseTraceParentEffect(
  value: unknown,
  traceState?: unknown,
): Effect.Effect<SpanContext | undefined> {
  return observeContract(
    "trace-context.parse-parent",
    Effect.gen(function* () {
      if (typeof value !== "string" || value.length < 55) return undefined;
      const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(.*)$/.exec(value);
      if (!match || match[0] !== value) return undefined;
      const [, version, traceId, spanId, flags, suffix] = match;
      if (version === "ff" || !(yield* isTraceIdEffect(traceId)) || !(yield* isSpanIdEffect(spanId)))
        return undefined;
      if (version === "00" ? suffix !== "" : suffix !== "" && !suffix?.startsWith("-"))
        return undefined;
      const state = yield* parseTraceStateEffect(traceState);
      return Object.freeze({
        traceId: traceId as TraceId,
        spanId: spanId as SpanId,
        traceFlags: Number.parseInt(flags!, 16) & 1,
        remote: true,
        ...(state === undefined ? {} : { traceState: state }),
      });
    }),
  );
}

/**
 * Synchronous compatibility parser for W3C traceparent metadata.
 * @param value - Candidate traceparent header.
 * @param traceState - Optional tracestate header.
 * @returns A remote context or undefined for invalid metadata.
 * @example parseTraceParent(headers.get("traceparent"));
 */
export function parseTraceParent(value: unknown, traceState?: unknown): SpanContext | undefined {
  return runContract(parseTraceParentEffect(value, traceState));
}

/**
 * Validates bounded W3C tracestate syntax.
 * @param value - Candidate tracestate header.
 * @returns An Effect containing trimmed state or undefined.
 * @example Effect.runSync(parseTraceStateEffect("vendor=state"));
 */
export function parseTraceStateEffect(value: unknown): Effect.Effect<string | undefined> {
  return observeContract(
    "trace-context.parse-state",
    Effect.sync(() => {
      if (typeof value !== "string" || value.length > 512) return undefined;
      const entries = value.split(",");
      if (entries.length > 32) return undefined;
      const keys = new Set<string>();
      for (const entry of entries) {
        const match =
          /^[ \t]*([a-z][a-z0-9_*/-]{0,255}|[a-z0-9][a-z0-9_*/-]{0,240}@[a-z][a-z0-9_*/-]{0,13})=([\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e])[ \t]*$/.exec(
            entry,
          );
        if (!match || keys.has(match[1]!)) return undefined;
        keys.add(match[1]!);
      }
      return value.trim();
    }),
  );
}

/**
 * Synchronous compatibility parser for W3C tracestate.
 * @param value - Candidate tracestate header.
 * @returns Trimmed state or undefined for invalid syntax.
 * @example parseTraceState("vendor=state");
 */
export function parseTraceState(value: unknown): string | undefined {
  return runContract(parseTraceStateEffect(value));
}

/**
 * Writes valid W3C context while excluding local request identifiers.
 * @param headers - Mutable outgoing headers.
 * @param context - Validated span context to inject.
 * @returns Nothing; invalid context leaves headers unchanged.
 * @throws When the Headers implementation rejects a mutation.
 * @example injectTraceContext(new Headers(), context);
 */
export function injectTraceContext(headers: Headers, context: SpanContext): void {
  runContract(injectTraceContextEffect(headers, context));
}

/**
 * Injects valid W3C context as an observable Effect operation.
 * @param headers - Mutable outgoing headers.
 * @param context - Span context to inject.
 * @returns An Effect completing after header mutation.
 * @example Effect.runSync(injectTraceContextEffect(new Headers(), context));
 */
export function injectTraceContextEffect(
  headers: Headers,
  context: SpanContext,
): Effect.Effect<void> {
  return observeContract(
    "trace-context.inject",
    Effect.gen(function* () {
      if (!(yield* isTraceIdEffect(context.traceId)) || !(yield* isSpanIdEffect(context.spanId)))
        return;
      const state = yield* parseTraceStateEffect(context.traceState);
      yield* Effect.sync(() => {
        headers.set(
          "traceparent",
          `00-${context.traceId}-${context.spanId}-${(context.traceFlags & 1).toString(16).padStart(2, "0")}`,
        );
        headers.delete("tracestate");
        if (state !== undefined) headers.set("tracestate", state);
      });
    }),
  );
}

/**
 * Parses a durable trace propagation envelope, discarding unknown fields.
 * @param value - Candidate wire envelope.
 * @returns An Effect containing a frozen envelope or undefined.
 * @example Effect.runSync(parseTracePropagationEffect({ version: 2, producer }));
 */
export function parseTracePropagationEffect(
  value: unknown,
): Effect.Effect<TracePropagation | undefined> {
  return observeContract(
    "trace-context.parse-propagation",
    Effect.gen(function* () {
      try {
        if (typeof value !== "object" || value === null) return undefined;
        const input = value as Partial<TracePropagation>;
        if (input.version !== 2 || !input.producer) return undefined;
        const { traceId, spanId, traceFlags, traceState } = input.producer;
        if (
          !(yield* isTraceIdEffect(traceId)) ||
          !(yield* isSpanIdEffect(spanId)) ||
          !Number.isInteger(traceFlags)
        )
          return undefined;
        if (traceFlags! < 0 || traceFlags! > 255) return undefined;
        const state = yield* parseTraceStateEffect(traceState);
        const identities: Record<string, string> = {};
        for (const key of [
          "requestId",
          "originRequestId",
          "correlationId",
          "invocationId",
        ] as const) {
          const id = input[key];
          if (
            typeof id === "string" &&
            id.length > 0 &&
            id.length <= 256 &&
            !/[\x00-\x1f\x7f]/.test(id)
          )
            identities[key] = id;
        }
        return Object.freeze({
          version: 2,
          ...identities,
          producer: Object.freeze({
            traceId,
            spanId,
            traceFlags: traceFlags! & 1,
            remote: true,
            ...(state === undefined ? {} : { traceState: state }),
          }),
        });
      } catch {
        return undefined;
      }
    }),
  );
}

/**
 * Synchronous compatibility parser for durable trace metadata.
 * @param value - Candidate wire envelope.
 * @returns A frozen envelope or undefined for malformed metadata.
 * @example parseTracePropagation({ version: 2, producer });
 */
export function parseTracePropagation(value: unknown): TracePropagation | undefined {
  return runContract(parseTracePropagationEffect(value));
}
