/** Signed run identity and namespace fields carried by a locator. */
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
/** Signing and verification keys for run locators. */
export interface RunLocatorKeyRing {
  readonly activeKeyId: string;
  readonly keys: Readonly<Record<string, string | Uint8Array>>;
}
/** Store of key rings used during locator rotation. */
export interface RunLocatorKeyRingStore {
  readonly load: () => RunLocatorKeyRing | Promise<RunLocatorKeyRing>;
  readonly save: (ring: RunLocatorKeyRing) => void | Promise<void>;
}
/** Options accepted for run locator create operations. */
export interface RunLocatorCreateOptions {
  readonly payload: RunLocatorPayload;
  readonly keyRing: RunLocatorKeyRing;
}
/** Options accepted for run locator verify operations. */
export interface RunLocatorVerifyOptions {
  readonly keyRing: RunLocatorKeyRing;
  readonly application?: string;
  readonly environment?: string;
  readonly scope?: string;
}
/** Decoded signed locator with trusted namespace and run identity. */
export interface VerifiedRunLocator extends RunLocatorPayload {
  readonly keyId: string;
  readonly version: 1;
}
