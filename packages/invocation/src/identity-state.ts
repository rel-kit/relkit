import { Context, Data, Effect, Layer, Option } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { IdentityStoreService } from "./identity.types.js";

/** Public compatibility error for descriptor identity conflicts.
 * @example throw new DescriptorIdentityError("Already bound");
 */
export class DescriptorIdentityError extends TypeError {
  readonly code = "RELKIT_DESCRIPTOR_IDENTITY_CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "DescriptorIdentityError";
  }
}

/** Tagged identity operation failure with its compatibility cause.
 * @example Effect.catchTag(bindDescriptorIdentityEffect(descriptor, id), "DescriptorIdentityFailure", () => Effect.void);
 */
export class DescriptorIdentityFailure extends Data.TaggedError("DescriptorIdentityFailure")<{
  readonly cause: DescriptorIdentityError | TypeError;
  readonly message: string;
}> {}

/** Process-local registry and random ID boundary.
 * @example Effect.provide(resolveDescriptorIdentityEffect(descriptor), IdentityStoreLive);
 */
export class IdentityStore extends Context.Service<IdentityStore, IdentityStoreService>()(
  "relkit/invocation/IdentityStore",
) {}

const liveStore: IdentityStoreService = {
  canonical: new WeakMap(),
  unbound: new WeakMap(),
  services: new WeakMap(),
  nextUnboundId: () => crypto.randomUUID(),
};

/** Live identity registry shared by compatibility callers.
 * @example Effect.runSync(Effect.provide(createUnboundIdentityEffect(), IdentityStoreLive));
 */
export const IdentityStoreLive = Layer.succeed(IdentityStore, liveStore);

/** Runs identity logic with a substitutable store and typed expected failures.
 * @param operation - Stable operation label.
 * @param body - Registry operation.
 * @returns Its value or a tagged identity failure; unexpected errors remain defects.
 * @example identityOperation("identity.bound", (store) => store.canonical.has(descriptor));
 */
export function identityOperation<A>(
  operation:
    | "identity.create"
    | "identity.bind"
    | "identity.is-bound"
    | "identity.service-bind"
    | "identity.service-get"
    | "identity.resolve"
    | "identity.get"
    | "identity.is-unbound",
  body: (store: IdentityStoreService) => A,
): Effect.Effect<A, DescriptorIdentityFailure> {
  return observeInvocation(
    operation,
    Effect.flatMap(Effect.serviceOption(IdentityStore), (provided) =>
      Effect.suspend(() => {
        try {
          return Effect.succeed(body(Option.isSome(provided) ? provided.value : liveStore));
        } catch (cause) {
          if (cause instanceof DescriptorIdentityError || cause instanceof TypeError)
            return Effect.fail(new DescriptorIdentityFailure({ cause, message: cause.message }));
          return Effect.die(cause);
        }
      }),
    ),
  );
}

/** Verifies an identity input is an object or function.
 * @param value - Candidate descriptor.
 * @returns Void or throws the compatibility TypeError.
 * @throws TypeError for null or primitive values.
 * @example assertIdentityObject(descriptor);
 */
export function assertIdentityObject(value: object): void {
  if (value === null || (typeof value !== "object" && typeof value !== "function"))
    throw new TypeError("Descriptor identity requires an object");
}

/** Runs an identity Effect for a synchronous compatibility caller.
 * @param effect - Identity operation.
 * @returns The successful value.
 * @throws The original descriptor TypeError or an unexpected defect.
 * @example runIdentitySync(createUnboundIdentityEffect());
 */
export function runIdentitySync<A>(effect: Effect.Effect<A, DescriptorIdentityFailure>): A {
  try {
    return runInvocationSync(effect);
  } catch (cause) {
    if (cause instanceof DescriptorIdentityFailure) throw cause.cause;
    throw cause;
  }
}
