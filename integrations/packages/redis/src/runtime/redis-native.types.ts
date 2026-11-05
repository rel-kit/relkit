/** The native Redis connection each runtime provides: one socket, raw commands, no offline queue. */

/** Settings for one native connection. */
export interface RedisNativeOptions {
  readonly url: string;
  readonly tls: boolean;
  readonly connectionTimeoutMs: number | undefined;
  /** Called once when the socket closes for any reason. */
  readonly onClose: () => void;
}

/** One native socket; it never reconnects or replays commands on its own. */
export interface RedisNativeClient {
  readonly connected: boolean;
  connect(): Promise<void>;
  close(): void;
  /**
   * Sends one command.
   * @param command - Redis command name.
   * @param args - Command arguments.
   * @returns The decoded reply.
   */
  send(command: string, args: readonly string[]): Promise<unknown>;
}

/** Opens a native connection without connecting it. */
export type OpenRedisNative = (options: RedisNativeOptions) => RedisNativeClient;
