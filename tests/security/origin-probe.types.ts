/** Captures only original native request observations asserted by the security contract. */
export interface OriginProbeRequest {
  /** Native loopback request path, including the selected original function ID. */
  readonly path: string;
  /** Actual HTTP method used by the archived probe. */
  readonly method: string;
  /** Original foreign Origin header, or absence on graph acquisition. */
  readonly origin: string | null;
}
