import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { TraceRandom, TraceRandomLive } from "./trace-random.js";
import type { TraceRandomError } from "./trace-random.js";
import type { TraceId } from "./id.types.js";
import type { SpanId, TraceIdentifiers } from "./trace-context.types.js";

export type {
  SpanContext,
  SpanId,
  SpanKind,
  TraceAttributes,
  TraceIdentifiers,
  TracePropagation,
} from "./trace-context.types.js";

/**
 * Tagged failure for a malformed W3C trace ID.
 * @example Effect.catchTag("TraceIdError", () => Effect.succeed(undefined));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class TraceIdError extends TypeError {
  readonly _tag = "TraceIdError" as const;
  constructor() {
    super("Invalid W3C trace ID");
    this.name = "TraceIdError";
  }
}

/**
 * Tagged failure for a malformed W3C span ID.
 * @example Effect.catchTag("SpanIdError", () => Effect.succeed(undefined));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class SpanIdError extends TypeError {
  readonly _tag = "SpanIdError" as const;
  constructor() {
    super("Invalid W3C span ID");
    this.name = "SpanIdError";
  }
}

/**
 * Validates a lowercase nonzero W3C trace ID.
 * @param value - Candidate ID.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isTraceIdEffect("4bf92f3577b34da6a3ce929d0e0e4736"));
 */
export function isTraceIdEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "trace-id.validate",
    Effect.sync(
      () => typeof value === "string" && /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value),
    ),
  );
}

/**
 * Synchronous predicate for a W3C trace ID.
 * @param value - Candidate ID.
 * @returns Whether the value is valid; narrows its TypeScript type.
 * @example if (isTraceId(value)) consume(value);
 */
export function isTraceId(value: unknown): value is TraceId {
  return runContract(isTraceIdEffect(value));
}

/**
 * Validates a lowercase nonzero W3C span ID.
 * @param value - Candidate ID.
 * @returns An Effect containing the validation result.
 * @example Effect.runSync(isSpanIdEffect("00f067aa0ba902b7"));
 */
export function isSpanIdEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "span-id.validate",
    Effect.sync(
      () => typeof value === "string" && /^[0-9a-f]{16}$/.test(value) && !/^0+$/.test(value),
    ),
  );
}

/**
 * Synchronous predicate for a W3C span ID.
 * @param value - Candidate ID.
 * @returns Whether the value is valid; narrows its TypeScript type.
 * @example if (isSpanId(value)) consume(value);
 */
export function isSpanId(value: unknown): value is SpanId {
  return runContract(isSpanIdEffect(value));
}

/**
 * Converts a validated W3C span ID to its nominal type.
 * @param value - Candidate ID.
 * @returns The typed ID or SpanIdError.
 * @example Effect.runSync(toSpanIdEffect("00f067aa0ba902b7"));
 */
export function toSpanIdEffect(value: unknown): Effect.Effect<SpanId, SpanIdError> {
  return observeContract(
    "span-id.convert",
    Effect.gen(function* () {
      if (!(yield* isSpanIdEffect(value))) return yield* Effect.fail(new SpanIdError());
      return value as SpanId;
    }),
  );
}

/**
 * Synchronous adapter for W3C span ID conversion.
 * @param value - Candidate ID.
 * @returns The typed span ID.
 * @throws SpanIdError for malformed input.
 * @example toSpanId("00f067aa0ba902b7");
 */
export function toSpanId(value: unknown): SpanId {
  return runContract(toSpanIdEffect(value));
}

/**
 * Creates a secure nonzero W3C trace ID using the live random Layer.
 * @returns The generated trace ID.
 * @throws When secure randomness is unavailable.
 * @example const traceId = createTraceId();
 */
export function createTraceId(): TraceId {
  return runContract(Effect.provide(createTraceIdEffect(), TraceRandomLive));
}

/**
 * Creates a secure nonzero W3C span ID using the live random Layer.
 * @returns The generated span ID.
 * @throws When secure randomness is unavailable.
 * @example const spanId = createSpanId();
 */
export function createSpanId(): SpanId {
  return runContract(Effect.provide(createSpanIdEffect(), TraceRandomLive));
}

/**
 * Creates a trace ID with an injectable secure byte source and telemetry.
 * @returns An Effect requiring TraceRandom and producing a W3C trace ID.
 * @example Effect.runSync(Effect.provide(createTraceIdEffect(), TraceRandomLive));
 */
export function createTraceIdEffect(): Effect.Effect<TraceId, TraceRandomError, TraceRandom> {
  return observeContract("trace-id.create", randomHexEffect(16)).pipe(
    Effect.map((value) => value as TraceId),
  );
}

/**
 * Creates a span ID with an injectable secure byte source and telemetry.
 * @returns An Effect requiring TraceRandom and producing a W3C span ID.
 * @example Effect.runSync(Effect.provide(createSpanIdEffect(), TraceRandomLive));
 */
export function createSpanIdEffect(): Effect.Effect<SpanId, TraceRandomError, TraceRandom> {
  return observeContract("span-id.create", randomHexEffect(8)).pipe(
    Effect.map((value) => value as SpanId),
  );
}

/**
 * Generates a trace ID and span ID concurrently through the injectable byte source.
 * Each ID owns its byte buffer; failure interrupts the other generation.
 * @returns An Effect requiring TraceRandom and producing both frozen identifiers, or TraceRandomError.
 * @example await Effect.runPromise(Effect.provide(createTraceIdentifiersEffect(), TraceRandomLive));
 */
export function createTraceIdentifiersEffect(): Effect.Effect<
  TraceIdentifiers,
  TraceRandomError,
  TraceRandom
> {
  return observeContract(
    "trace-identifiers.create",
    Effect.map(
      Effect.all(
        { traceId: createTraceIdEffect(), spanId: createSpanIdEffect() },
        { concurrency: 2 },
      ),
      (identifiers) => Object.freeze(identifiers),
    ),
  );
}

function randomHexEffect(bytes: number): Effect.Effect<string, TraceRandomError, TraceRandom> {
  return Effect.gen(function* () {
    const random = yield* TraceRandom;
    const data = new Uint8Array(bytes);
    do yield* random.fill(data);
    while (data.every((byte) => byte === 0));
    return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });
}
