import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import { RunLocatorError } from "./run-id-errors.js";
import { RUN_LOCATOR_VERSION, RUN_LOCATOR_MAX_BYTES } from "./run-id.js";
import type {
  RunLocatorPayload,
  RunLocatorKeyRing,
  RunLocatorCreateOptions,
  RunLocatorVerifyOptions,
  VerifiedRunLocator,
} from "./run-id.types.js";
import {
  assertSegment,
  isBase64Url,
  namespaceHash,
  normalizePayload,
  validateRunLocatorKeyRing,
} from "./run-id-support.js";
/** Serializes and signs a validated run locator payload.
 * @param options - Payload and active signing key ring.
 * @returns A bounded, authenticated locator string.
 * @throws RunLocatorError when keys, payload, or encoded length are invalid.
 * @example createRunLocatorValue({ keyRing, payload });
 */
export function createRunLocatorValue(options: RunLocatorCreateOptions): string {
  validateRunLocatorKeyRing(options.keyRing);
  const keyId = options.keyRing.activeKeyId;
  const secret = options.keyRing.keys[keyId];
  assertSegment(keyId);
  if (secret === undefined) throw new RunLocatorError();
  const payload = normalizePayload(options.payload);
  const body = { version: RUN_LOCATOR_VERSION, keyId, payload } as const;
  const encodedBody = encode(canonicalJson(body));
  const mac = macFor(encodedBody, secret);
  const locator = `${encodedBody}.${encode(mac)}`;
  if (byteLength(locator) > RUN_LOCATOR_MAX_BYTES) throw new RunLocatorError();
  return locator;
}
/** Verifies a locator signature, payload, and requested deployment namespace.
 * @param locator - Encoded locator from a caller or durable record.
 * @param options - Verification keys and expected namespace fields.
 * @returns A frozen verified locator.
 * @throws RunLocatorError on malformed encoding, signature, or namespace.
 * @example verifyRunLocatorValue(locator, { keyRing, application: "shop" });
 */
export function verifyRunLocatorValue(
  locator: string,
  options: RunLocatorVerifyOptions,
): VerifiedRunLocator {
  validateRunLocatorKeyRing(options.keyRing);
  if (typeof locator !== "string" || byteLength(locator) > RUN_LOCATOR_MAX_BYTES)
    throw new RunLocatorError();
  const parts = locator.split(".");
  if (parts.length !== 2) throw new RunLocatorError();
  const [encodedBody, encodedMac] = parts;
  if (!isBase64Url(encodedBody) || !isBase64Url(encodedMac)) throw new RunLocatorError();
  let body: unknown;
  let signature: Buffer;
  try {
    body = JSON.parse(Buffer.from(encodedBody!, "base64url").toString("utf8"));
    signature = Buffer.from(encodedMac!, "base64url");
  } catch {
    throw new RunLocatorError();
  }
  if (!isBody(body)) throw new RunLocatorError();
  assertSegment(body.keyId);
  const secret = options.keyRing.keys[body.keyId];
  if (secret === undefined) throw new RunLocatorError();
  const expected = macFor(encodedBody!, secret);
  if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
    throw new RunLocatorError();
  }
  const payload = normalizePayload(body.payload);
  if (
    (options.application !== undefined && payload.application !== options.application) ||
    (options.environment !== undefined && payload.environment !== options.environment) ||
    (options.scope !== undefined &&
      payload.namespaceHash !==
        namespaceHash(payload.application, payload.environment, options.scope))
  ) {
    throw new RunLocatorError();
  }
  return Object.freeze({
    version: RUN_LOCATOR_VERSION,
    keyId: body.keyId,
    ...payload,
    ...(options.scope === undefined ? {} : { scope: options.scope }),
  });
}
/** Adds a signing key while retaining prior keys for existing locators.
 * @param ring - Existing validated key ring.
 * @param keyId - New active key identifier.
 * @param secret - New signing secret.
 * @returns A frozen key ring with the new active key.
 * @throws RunLocatorError when the ring or new key identifier is invalid.
 * @example rotateRunLocatorKeysValue(keyRing, "v2", "new-secret");
 */
export function rotateRunLocatorKeysValue(
  ring: RunLocatorKeyRing,
  keyId: string,
  secret: string | Uint8Array,
): RunLocatorKeyRing {
  validateRunLocatorKeyRing(ring);
  assertSegment(keyId);
  return Object.freeze({
    activeKeyId: keyId,
    keys: Object.freeze({ ...ring.keys, [keyId]: secret }),
  });
}
function macFor(value: string, secret: string | Uint8Array): Buffer {
  return createHmac("sha256", secret).update(value, "utf8").digest();
}
function encode(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
function isBody(
  value: unknown,
): value is { readonly version: 1; readonly keyId: string; readonly payload: RunLocatorPayload } {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.keyId === "string" &&
    isRecord(value.payload)
  );
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
