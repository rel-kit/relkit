import { Context, Effect, Layer, Option } from "effect";
import { createSpanId, createTraceId } from "@relkit/contracts";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  InvocationIdSource,
  InvocationKind,
  StandardSchemaV1,
} from "./validation-defaults.types.js";

const liveIdSource: InvocationIdSource = {
  next: (kind) =>
    (kind === "trace"
      ? createTraceId()
      : kind === "span"
        ? createSpanId()
        : `invocation-${crypto.randomUUID()}`) as import("@relkit/contracts").ProtocolId,
};

/** Substitutable ID generator for invocation records.
 * @example Effect.provide(nextInvocationIdEffect("trace"), InvocationIdSourceLive);
 */
export class InvocationIdGenerator extends Context.Service<
  InvocationIdGenerator,
  InvocationIdSource
>()("relkit/invocation/InvocationIdGenerator") {}

/** Process-local live ID generator.
 * @example Effect.runSync(Effect.provide(nextInvocationIdEffect("span"), InvocationIdSourceLive));
 */
export const InvocationIdSourceLive = Layer.succeed(InvocationIdGenerator, liveIdSource);

/** Generates a protocol ID through an injectable service.
 * @param kind - ID kind.
 * @returns Generated ID with no expected failure.
 * @example Effect.runSync(nextInvocationIdEffect("trace"));
 */
export function nextInvocationIdEffect(kind: InvocationKind) {
  return observeInvocation(
    "validation.next-id",
    Effect.flatMap(Effect.serviceOption(InvocationIdGenerator), (provided) =>
      Effect.sync(() => (Option.isSome(provided) ? provided.value : liveIdSource).next(kind)),
    ),
  );
}

/** Default ID source for standalone invocation compatibility callers. */
export const defaultIdSource: InvocationIdSource = {
  next: (kind) => runInvocationSync(nextInvocationIdEffect(kind)),
};

/** Default runner delegates to the Effect Promise runtime. */
export const defaultRunner = {
  run: <A, E>(effect: Effect.Effect<A, E, never>, options?: { readonly signal?: AbortSignal }) =>
    Effect.runPromise(observeInvocation("validation.run-default", effect), options),
};

/** Passes an unknown value through the default schema.
 * @param value - Any input value.
 * @returns The original value with no expected failure.
 * @example Effect.runSync(validateUnknownEffect({ count: 1 }));
 */
export function validateUnknownEffect(value: unknown): Effect.Effect<{ value: unknown }> {
  return observeInvocation("validation.unknown", Effect.succeed({ value }));
}

/** Passthrough Standard Schema used when no concrete schema is supplied. */
export const unknownSchema: StandardSchemaV1 = Object.freeze({
  "~standard": Object.freeze({
    version: 1,
    vendor: "relkit",
    validate: (value: unknown) => runInvocationSync(validateUnknownEffect(value)),
  }),
});
