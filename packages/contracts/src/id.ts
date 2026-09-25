import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import type { ProtocolId, StableId } from "./id.types.js";

export * from "./id-conversions.js";

export type {
  DescriptorId,
  DescriptorKind,
  EventInstanceId,
  GenerationId,
  GraphHash,
  InvocationId,
  ProtocolId,
  Ref,
  RequestId,
  StableId,
  TraceId,
} from "./id.types.js";

const STABLE_ID_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

/**
 * Tagged failure when an identifier cannot be represented as a stable ID.
 * The `reason` field identifies the violated stable-ID rule.
 * @example Effect.catchTag("StableIdError", (error) => Effect.logWarning(error.reason));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class StableIdError extends TypeError {
  readonly _tag = "StableIdError" as const;
  constructor(readonly reason: string) {
    super(`Invalid stable ID: ${reason}`);
    this.name = "StableIdError";
  }
}

export { StableIdError as IdError, StableIdError as IdValidationError };

/**
 * Normalizes and validates a stable ID without deriving identity from a path.
 * @param value - Candidate identifier.
 * @returns An Effect containing the canonical stable ID.
 * @example
 * const id = Effect.runSync(normalizeIdEffect(" orders.list "));
 */
export function normalizeIdEffect(value: unknown): Effect.Effect<StableId, StableIdError> {
  return observeContract(
    "id.normalize",
    Effect.gen(function* () {
      if (typeof value !== "string")
        return yield* Effect.fail(new StableIdError("expected a string"));
      const normalized = value.normalize("NFC").trim();
      if (normalized.length === 0)
        return yield* Effect.fail(new StableIdError("expected a non-empty value"));
      if (!STABLE_ID_PATTERN.test(normalized)) {
        return yield* Effect.fail(
          new StableIdError("use letters, numbers, '.', '_' or '-' between alphanumeric segments"),
        );
      }
      return normalized as StableId;
    }),
  );
}

/**
 * Synchronous compatibility adapter for stable ID normalization.
 * @param value - Candidate identifier.
 * @returns The canonical stable ID.
 * @throws StableIdError when the value cannot be normalized.
 * @example
 * const id = normalizeId(" orders.list ");
 */
export function normalizeId(value: unknown): StableId {
  return runContract(normalizeIdEffect(value));
}

/**
 * Checks a value without normalizing it.
 * @param value - Candidate stable ID.
 * @returns An Effect containing whether the value is canonical.
 * @example
 * const valid = Effect.runSync(isStableIdEffect("orders.list"));
 */
export function isStableIdEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract(
    "id.is-stable",
    Effect.sync(
      () => typeof value === "string" && value === value.trim() && STABLE_ID_PATTERN.test(value),
    ),
  );
}

/**
 * Synchronous compatibility predicate for a canonical stable ID.
 * @param value - Candidate stable ID.
 * @returns Whether the value is canonical; narrows its TypeScript type.
 * @example
 * if (isStableId(value)) consume(value);
 */
export function isStableId(value: unknown): value is StableId {
  return runContract(isStableIdEffect(value));
}

export const isValidId = isStableId;

/**
 * Validates a canonical stable ID without trimming it.
 * @param value - Candidate stable ID.
 * @returns An Effect completing when the value is valid.
 * @example
 * Effect.runSync(assertStableIdEffect("orders.list"));
 */
export function assertStableIdEffect(value: unknown): Effect.Effect<void, StableIdError> {
  return observeContract(
    "id.assert-stable",
    Effect.gen(function* () {
      if (!(yield* isStableIdEffect(value))) {
        return yield* Effect.fail(new StableIdError("expected a canonical stable ID"));
      }
    }),
  );
}

/**
 * Synchronous compatibility assertion for a canonical stable ID.
 * @param value - Candidate stable ID.
 * @returns Nothing; narrows the input type on success.
 * @throws StableIdError when the input is invalid.
 * @example
 * assertStableId("orders.list");
 */
export function assertStableId(value: unknown): asserts value is StableId {
  runContract(assertStableIdEffect(value));
}

export const assertValidId = assertStableId;

/**
 * Normalizes a versioned protocol ID.
 * @param value - Candidate protocol ID.
 * @returns An Effect containing the nominal protocol ID.
 * @example
 * const id = Effect.runSync(normalizeProtocolIdEffect("request-1"));
 */
export function normalizeProtocolIdEffect(
  value: unknown,
): Effect.Effect<ProtocolId, StableIdError> {
  return observeContract(
    "id.normalize-protocol",
    Effect.map(normalizeIdEffect(value), (id) => id as ProtocolId),
  );
}

/**
 * Synchronous compatibility adapter for protocol ID normalization.
 * @param value - Candidate protocol ID.
 * @returns The nominal protocol ID.
 * @throws StableIdError when the input is invalid.
 * @example
 * const id = normalizeProtocolId("request-1");
 */
export function normalizeProtocolId(value: unknown): ProtocolId {
  return runContract(normalizeProtocolIdEffect(value));
}

/**
 * Checks whether a candidate is a canonical protocol ID.
 * @param value - Candidate protocol ID.
 * @returns An Effect containing the validation result.
 * @example
 * const valid = Effect.runSync(isProtocolIdEffect("request-1"));
 */
export function isProtocolIdEffect(value: unknown): Effect.Effect<boolean> {
  return observeContract("id.is-protocol", isStableIdEffect(value));
}

/**
 * Synchronous compatibility predicate for a protocol ID.
 * @param value - Candidate protocol ID.
 * @returns Whether the value is canonical; narrows its TypeScript type.
 * @example
 * if (isProtocolId(value)) consume(value);
 */
export function isProtocolId(value: unknown): value is ProtocolId {
  return runContract(isProtocolIdEffect(value));
}
