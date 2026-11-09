/** The accepted downstream socket: Bun's `ServerWebSocket` or Hono's `WSContext` on Node. */
export interface ProxyDownstream {
  /** WebSocket ready state; 1 is open. */
  readonly readyState: number;
  /**
   * Sends one frame.
   * @param data - Text or binary frame.
   */
  send(data: string | Uint8Array): unknown;
  /**
   * Starts the closing handshake.
   * @param code - Close code.
   * @param reason - Close reason.
   */
  close(code?: number, reason?: string): unknown;
}

/** Callback bindings for one generation-pinned tunnel. */
export interface ProxySocketData {
  readonly upstream: WebSocket;
  /** Settles the owned native connection barrier. @returns Nothing; repeated native close callbacks are harmless. */
  readonly release: () => void;
  /** Attaches accepted downstream and flushes ordered pending frames. @param socket - Native server socket. */
  readonly open: (socket: ProxyDownstream) => void;
}

/** Owned upstream-to-downstream handshake buffer and native socket witness. */
export interface ProxySocketState {
  readonly downstream: ProxyDownstream | undefined;
  readonly pending: readonly (string | Uint8Array)[];
  readonly bytes: number;
}
