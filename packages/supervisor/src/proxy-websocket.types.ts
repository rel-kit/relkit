/** Native Bun callback bindings for one generation-pinned tunnel. */
export interface ProxySocketData {
  readonly upstream: WebSocket;
  /** Settles the owned native connection barrier. @returns Nothing; repeated native close callbacks are harmless. */
  readonly release: () => void;
  /** Attaches accepted downstream and flushes ordered pending frames. @param socket - Native server socket. */
  readonly open: (socket: Bun.ServerWebSocket<ProxySocketData>) => void;
}

/** Owned upstream-to-downstream handshake buffer and native socket witness. */
export interface ProxySocketState {
  readonly downstream: Bun.ServerWebSocket<ProxySocketData> | undefined;
  readonly pending: readonly (string | Uint8Array)[];
  readonly bytes: number;
}
