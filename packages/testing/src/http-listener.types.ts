import type { TestHttpRequest } from "./http.js";

/** Native behavior requiring a real Bun listener in compatibility acceptance. */
export type RealListenerPurpose = "disconnect" | "stream" | "proxy";

/** Explicit native socket identity, timeout and disconnect test policy. */
export interface TestHttpListenerOptions {
  readonly purpose?: RealListenerPurpose;
  readonly hostname?: string;
  readonly port?: number;
  readonly idleTimeout?: number;
  readonly closeTimeoutMs?: number;
}

/** Owned real Bun server handle and native request/release boundary. */
export interface TestHttpListener {
  readonly purpose: RealListenerPurpose;
  readonly url: URL;
  readonly server: Bun.Server<undefined>;
  readonly request: TestHttpRequest;
  readonly close: () => Promise<void>;
}
