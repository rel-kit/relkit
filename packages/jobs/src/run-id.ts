import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import { RunLocatorError } from "./run-id-errors.js";
import {
  assertSegment,
  isBase64Url,
  namespaceHash,
  normalizePayload,
  validateRunLocatorKeyRing,
} from "./run-id-support.js";

export { RunLocatorError } from "./run-id-errors.js";
export {
  namespaceHash,
  validateRunLocatorKeyRing,
} from "./run-id-support.js";

export const RUN_LOCATOR_VERSION = 1 as const;
export const RUN_LOCATOR_MAX_BYTES = 4096 as const;

export interface RunLocatorPayload {
  readonly application: string;
  readonly environment: string;
  readonly serviceGeneration: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  /** Accepted only while creating a locator; the clear-text scope is never encoded. */
  readonly scope?: string;
  readonly namespaceHash?: string;
  readonly schemaHash?: string;
  readonly native: { readonly kind: string; readonly value: string };
}

export interface RunLocatorKeyRing {
  readonly activeKeyId: string;
  readonly keys: Readonly<Record<string, string | Uint8Array>>;
}

export interface RunLocatorKeyRingStore {
  readonly load: () => RunLocatorKeyRing | Promise<RunLocatorKeyRing>;
  readonly save: (ring: RunLocatorKeyRing) => void | Promise<void>;
}

export interface RunLocatorCreateOptions {
  readonly payload: RunLocatorPayload;
  readonly keyRing: RunLocatorKeyRing;
}

export interface RunLocatorVerifyOptions {
  readonly keyRing: RunLocatorKeyRing;
  readonly application?: string;
  readonly environment?: string;
  readonly scope?: string;
}

export interface VerifiedRunLocator extends RunLocatorPayload {
  readonly keyId: string;
  readonly version: typeof RUN_LOCATOR_VERSION;
}

export function createRunLocator(options: RunLocatorCreateOptions): string {
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

export function verifyRunLocator(
  locator: string,
  options: RunLocatorVerifyOptions,
): VerifiedRunLocator {
  validateRunLocatorKeyRing(options.keyRing);
  if (typeof locator !== "string" || byteLength(locator) > RUN_LOCATOR_MAX_BYTES) throw new RunLocatorError();
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
    options.application !== undefined && payload.application !== options.application ||
    options.environment !== undefined && payload.environment !== options.environment ||
    options.scope !== undefined &&
    payload.namespaceHash !== namespaceHash(payload.application, payload.environment, options.scope)
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

export const encodeRunLocator = createRunLocator;
export const decodeRunLocator = verifyRunLocator;

export function rotateRunLocatorKeys(
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

function isBody(value: unknown): value is { readonly version: 1; readonly keyId: string; readonly payload: RunLocatorPayload } {
  return isRecord(value) && value.version === 1 && typeof value.keyId === "string" && isRecord(value.payload);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
