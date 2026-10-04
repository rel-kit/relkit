import { Context, Effect, Layer, Ref } from "effect";
import type { InvocationIdSource } from "@relkit/engine";
import type { ProtocolId } from "@relkit/contracts";
import type { TestIdentityService } from "./identity.types.js";

/** Native trace/span/invocation identity sequence belongs to one deterministic owner. */
export class TestIdentity extends Context.Service<TestIdentity, TestIdentityService>()(
  "relkit/testing/Identity",
) {}

/**
 * Creates atomic monotonic native identities without global randomness.
 * @returns An isolated service implementing native identity formats.
 */
function makeIdentity(): TestIdentityService {
  const sequence = Ref.makeUnsafe(0);
  return TestIdentity.of({
    next: (kind) =>
      Effect.fn("Testing.identity.next")(() =>
        Ref.modify(sequence, (prior) => {
          const value = prior + 1;
          return [
            (kind === "trace"
              ? value.toString(16).padStart(32, "0")
              : kind === "span"
                ? value.toString(16).padStart(16, "0")
                : `test-invocation-${value}`) as ProtocolId,
            value,
          ];
        }),
      )(),
  });
}

/**
 * Builds the identity service once per provisioned owner.
 * @returns A synchronous, substitutable deterministic identity Layer.
 */
export function identityLayer() {
  return Layer.sync(TestIdentity, makeIdentity);
}

/**
 * Exposes native synchronous identity generation over the same service contract.
 * @returns A deterministic invocation ID source with isolated sequence state.
 */
export function createTestIdentitySource(): InvocationIdSource {
  const service = makeIdentity();
  return { next: (kind) => Effect.runSync(service.next(kind)) };
}
