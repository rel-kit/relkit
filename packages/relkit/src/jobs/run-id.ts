import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type {
  RunLocatorPayload,
  RunLocatorKeyRing,
  RunLocatorCreateOptions,
  RunLocatorVerifyOptions,
  VerifiedRunLocator,
} from "./run-id.types.js";
export type {
  RunLocatorPayload,
  RunLocatorKeyRing,
  RunLocatorKeyRingStore,
  RunLocatorCreateOptions,
  RunLocatorVerifyOptions,
  VerifiedRunLocator,
} from "./run-id.types.js";
import { RunLocatorError } from "./run-id-errors.js";
import {
  namespaceHash as namespaceHashValue,
  validateRunLocatorKeyRing as validateRunLocatorKeyRingValue,
} from "./run-id-support.js";
import {
  createRunLocatorValue,
  verifyRunLocatorValue,
  rotateRunLocatorKeysValue,
} from "./run-id-codec.js";
export { RunLocatorError } from "./run-id-errors.js";
/** Wire format version for signed run locators.
 * @example RUN_LOCATOR_VERSION === 1;
 */
export const RUN_LOCATOR_VERSION = 1 as const;
/** Maximum encoded locator size accepted at the jobs boundary.
 * @example locator.length <= RUN_LOCATOR_MAX_BYTES;
 */
export const RUN_LOCATOR_MAX_BYTES = 4096 as const;
/** Invalid signed run locator or key rotation.
 * @example if (error instanceof RunLocatorFailure) console.log(error.message);
 */
export class RunLocatorFailure extends Schema.TaggedError<RunLocatorFailure>()(
  "Jobs.RunLocatorFailure",
  { operation: Schema.String },
) {}
/** Hashes a trusted deployment namespace in Effect.
 * @param application - Application identity.
 * @param environment - Environment identity.
 * @param scope - Trusted scope identity.
 * @returns A namespace hash or RunLocatorFailure.
 * @example Effect.runSync(namespaceHashEffect("shop", "production", "orders"));
 */
export const namespaceHashEffect = Effect.fn("Jobs.namespaceHash")(
  (application: string, environment: string, scope: string) =>
    observeJobs(
      "runLocator.namespaceHash",
      locatorTry("namespaceHash", () => namespaceHashValue(application, environment, scope)),
    ),
);
/** Synchronously hashes a trusted deployment namespace.
 * @param application - Application identity.
 * @param environment - Environment identity.
 * @param scope - Trusted scope identity.
 * @returns A namespace hash.
 * @throws RunLocatorError for invalid identities.
 * @example namespaceHash("shop", "production", "orders");
 */
export function namespaceHash(application: string, environment: string, scope: string): string {
  return runLocator(namespaceHashEffect(application, environment, scope));
}
/** Validates a locator key ring in Effect.
 * @param ring - Active and retained signing keys.
 * @returns Void or RunLocatorFailure.
 * @example Effect.runSync(validateRunLocatorKeyRingEffect(ring));
 */
export const validateRunLocatorKeyRingEffect = Effect.fn("Jobs.validateRunLocatorKeyRing")(
  (ring: RunLocatorKeyRing) =>
    observeJobs(
      "runLocator.validateKeyRing",
      locatorTry("validateKeyRing", () => validateRunLocatorKeyRingValue(ring)),
    ),
);
/** Synchronously validates a locator key ring.
 * @param ring - Active and retained signing keys.
 * @returns Nothing when the ring is usable.
 * @throws RunLocatorError for invalid keys or IDs.
 * @example validateRunLocatorKeyRing(ring);
 */
export function validateRunLocatorKeyRing(ring: RunLocatorKeyRing): void {
  runLocator(validateRunLocatorKeyRingEffect(ring));
}
/** Signs a run locator in Effect.
 * @param options - Payload and active signing key ring.
 * @returns Encoded locator or RunLocatorFailure.
 * @example Effect.runSync(createRunLocatorEffect({ payload, keyRing }));
 */
export const createRunLocatorEffect = Effect.fn("Jobs.createRunLocator")(
  (options: RunLocatorCreateOptions) =>
    observeJobs(
      "runLocator.create",
      locatorTry("create", () => createRunLocatorValue(options)),
    ),
);
/** Synchronously signs a run locator.
 * @param options - Payload and active signing key ring.
 * @returns Encoded locator.
 * @throws RunLocatorError when the payload or key ring is invalid.
 * @example createRunLocator({ payload, keyRing });
 */
export function createRunLocator(options: RunLocatorCreateOptions): string {
  return runLocator(createRunLocatorEffect(options));
}
/** Verifies a run locator in Effect.
 * @param locator - Encoded signed locator.
 * @param options - Key ring and optional expected namespace.
 * @returns Verified payload or RunLocatorFailure.
 * @example Effect.runSync(verifyRunLocatorEffect(locator, { keyRing }));
 */
export const verifyRunLocatorEffect = Effect.fn("Jobs.verifyRunLocator")(
  (locator: string, options: RunLocatorVerifyOptions) =>
    observeJobs(
      "runLocator.verify",
      locatorTry("verify", () => verifyRunLocatorValue(locator, options)),
    ),
);
/** Synchronously verifies a signed run locator.
 * @param locator - Encoded signed locator.
 * @param options - Key ring and optional expected namespace.
 * @returns Verified payload.
 * @throws RunLocatorError when the locator is invalid or has another namespace.
 * @example verifyRunLocator(locator, { keyRing });
 */
export function verifyRunLocator(
  locator: string,
  options: RunLocatorVerifyOptions,
): VerifiedRunLocator {
  return runLocator(verifyRunLocatorEffect(locator, options));
}
/** Compatibility alias for createRunLocator.
 * @example encodeRunLocator({ payload, keyRing });
 */
export const encodeRunLocator = createRunLocator;
/** Compatibility alias for verifyRunLocator.
 * @example decodeRunLocator(locator, { keyRing });
 */
export const decodeRunLocator = verifyRunLocator;
/** Rotates the active locator signing key in Effect.
 * @param ring - Existing key ring.
 * @param keyId - New active key identifier.
 * @param secret - New signing secret.
 * @returns Frozen rotated ring or RunLocatorFailure.
 * @example Effect.runSync(rotateRunLocatorKeysEffect(ring, "v2", secret));
 */
export const rotateRunLocatorKeysEffect = Effect.fn("Jobs.rotateRunLocatorKeys")(
  (ring: RunLocatorKeyRing, keyId: string, secret: string | Uint8Array) =>
    observeJobs(
      "runLocator.rotate",
      locatorTry("rotate", () => rotateRunLocatorKeysValue(ring, keyId, secret)),
    ),
);
/** Synchronously rotates a locator signing key.
 * @param ring - Existing key ring.
 * @param keyId - New active key identifier.
 * @param secret - New signing secret.
 * @returns Frozen rotated ring.
 * @throws RunLocatorError when the ring or key identifier is invalid.
 * @example rotateRunLocatorKeys(ring, "v2", secret);
 */
export function rotateRunLocatorKeys(
  ring: RunLocatorKeyRing,
  keyId: string,
  secret: string | Uint8Array,
): RunLocatorKeyRing {
  return runLocator(rotateRunLocatorKeysEffect(ring, keyId, secret));
}
function locatorTry<A>(operation: string, compute: () => A): Effect.Effect<A, RunLocatorFailure> {
  return Effect.try({
    try: compute,
    catch: (error) => {
      if (error instanceof RunLocatorError) return new RunLocatorFailure({ operation });
      throw error;
    },
  });
}
function runLocator<A>(effect: Effect.Effect<A, RunLocatorFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw new RunLocatorError();
  return result.success;
}
