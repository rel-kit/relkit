/** Native byte framing options, separate from total retained startup output. */
export interface OutputLineOptions {
  readonly maxBytes?: number;
  /** Receives retained bytes. @param bytes - Native chunk before decoding. */
  readonly retain?: (bytes: Uint8Array) => void;
  readonly signal?: AbortSignal;
}
