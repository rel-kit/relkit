import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { isDescriptorEffect, isRefEffect } from "./descriptor-validation.js";
import type { DescriptorAny } from "./descriptor.types.js";
import type { DescriptorKind, Ref } from "./id.types.js";

/**
 * Tagged failure for an invalid descriptor reference.
 * @example Effect.catchTag("DescriptorReferenceError", () => Effect.succeed(undefined));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class DescriptorReferenceError extends TypeError {
  readonly _tag = "DescriptorReferenceError" as const;
  constructor() {
    super("Invalid RelKit descriptor reference");
    this.name = "DescriptorReferenceError";
  }
}

/**
 * Tagged failure for a forged or inconsistent descriptor.
 * @example Effect.catchTag("DescriptorError", () => Effect.succeed(undefined));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class DescriptorError extends TypeError {
  readonly _tag = "DescriptorError" as const;
  constructor() {
    super("Invalid RelKit descriptor");
    this.name = "DescriptorError";
  }
}

/**
 * Requires a valid descriptor reference.
 * @param value - Candidate reference.
 * @param kind - Optional required kind.
 * @returns An Effect completing when the reference is valid, or DescriptorReferenceError.
 * @example Effect.runSync(assertRefEffect({ kind: "route", id: "orders.get" }));
 */
export function assertRefEffect(
  value: unknown,
  kind?: DescriptorKind,
): Effect.Effect<void, DescriptorReferenceError> {
  return observeContract(
    "descriptor.assert-ref",
    Effect.gen(function* () {
      if (!(yield* isRefEffect(value, kind))) {
        return yield* Effect.fail(new DescriptorReferenceError());
      }
    }),
  );
}

/** Asserts any supported descriptor reference. */
export function assertRef(value: unknown): asserts value is Ref<DescriptorKind, string>;
/** Asserts a reference with the supplied descriptor kind. */
export function assertRef<Kind extends DescriptorKind>(
  value: unknown,
  kind: Kind,
): asserts value is Ref<Kind, string>;
/**
 * Synchronous assertion for descriptor references.
 * @param value - Candidate reference.
 * @param kind - Optional required kind.
 * @returns Nothing; narrows the input type on success.
 * @throws DescriptorReferenceError when the reference is invalid.
 * @example assertRef({ kind: "route", id: "orders.get" });
 */
export function assertRef(value: unknown, kind?: DescriptorKind): void {
  runContract(assertRefEffect(value, kind));
}

/**
 * Requires a branded descriptor with a matching stable reference.
 * @param value - Candidate descriptor.
 * @returns An Effect completing on success, or DescriptorError.
 * @example Effect.runSync(assertDescriptorEffect(candidate));
 */
export function assertDescriptorEffect(value: unknown): Effect.Effect<void, DescriptorError> {
  return observeContract(
    "descriptor.assert-descriptor",
    Effect.gen(function* () {
      if (!(yield* isDescriptorEffect(value))) return yield* Effect.fail(new DescriptorError());
    }),
  );
}

/**
 * Synchronous assertion for a branded RelKit descriptor.
 * @param value - Candidate descriptor.
 * @returns Nothing; narrows the input type on success.
 * @throws DescriptorError when branding or reference identity is invalid.
 * @example assertDescriptor(candidate);
 */
export function assertDescriptor(value: unknown): asserts value is DescriptorAny {
  runContract(assertDescriptorEffect(value));
}
