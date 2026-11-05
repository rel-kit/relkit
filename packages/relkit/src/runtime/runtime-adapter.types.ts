/**
 * Declares the runtime adapter contract. Serving, static files, WebSocket upgrades, crypto,
 * environment access, filesystem availability, child processes and module resolution go through
 * one adapter per runtime, so the rest of RelKit stays free of `Bun.*` and runtime-specific
 * modules.
 */
import type { UpgradeWebSocket } from "hono/ws";
import type { RuntimeModules, RuntimeProcesses } from "./runtime-processes.types.js";

/** Runtimes that have an adapter. Tier 1 runtimes run every Core feature. */
export type RuntimeName = "bun" | "node";

/**
 * Opaque per-request bindings the adapter passes beside each request. Hono hands them to WebSocket
 * upgrade helpers as `c.env`; callers forward them unchanged and never inspect them.
 */
export type RuntimeRequestBindings = object;

/** Fetch handler a runtime server calls for every request, including WebSocket upgrades. */
export type RuntimeFetch = (
  request: Request,
  bindings: RuntimeRequestBindings,
) => Response | Promise<Response>;

/** Listener settings for one server. */
export interface RuntimeServeOptions {
  readonly hostname: string;
  /** TCP port; `0` asks the runtime for a free port. */
  readonly port: number;
  readonly fetch: RuntimeFetch;
  /** Largest request body the listener accepts before the handler reads it. */
  readonly maxRequestBodySize?: number;
}

/** A listening server. */
export interface RuntimeServer {
  /** Port the listener is bound to. */
  readonly port: number;
  /**
   * Stops accepting connections.
   * @param force - Also closes open connections instead of waiting for them.
   * @returns Completion once the listener is closed.
   */
  readonly stop: (force?: boolean) => Promise<void>;
}

/** Lazily read file contents; Bun's `BunFile` and Node's `fs.openAsBlob` result both are one. */
export interface RuntimeFileBody extends Blob {
  /**
   * Selects a byte range without reading the rest of the file.
   * @param start - First byte offset.
   * @param end - Offset after the last byte.
   * @returns The selected bytes.
   */
  slice(start?: number, end?: number): Blob;
}

/** One regular file opened for a response body. */
export interface RuntimeFile {
  /** File contents with its detected media type (empty when unknown). */
  readonly blob: RuntimeFileBody;
  /** Last modification time in milliseconds since the epoch. */
  readonly lastModified: number;
}

/** Filesystem access a runtime offers; runtimes without a filesystem omit it. */
export interface RuntimeFiles {
  /**
   * Opens a file for a response body without reading it.
   * @param path - Absolute path of an existing regular file.
   * @returns The lazily read file.
   */
  readonly open: (path: string) => Promise<RuntimeFile>;
}

/** Hashing and identifiers. */
export interface RuntimeCrypto {
  /**
   * Hashes bytes or UTF-8 text with SHA-256.
   * @param data - Input bytes or text.
   * @returns Lowercase hexadecimal digest.
   */
  readonly sha256Hex: (data: string | Uint8Array) => string;
  /** @returns A random RFC 9562 version 4 UUID. */
  readonly randomUUID: () => string;
}

/** Process environment variables. */
export interface RuntimeEnvironment {
  /**
   * Reads one variable.
   * @param name - Variable name.
   * @returns Its value, or undefined when unset.
   */
  readonly get: (name: string) => string | undefined;
  /** @returns A snapshot of every set variable. */
  readonly snapshot: () => Readonly<Record<string, string>>;
}

/** Everything RelKit needs from the runtime it runs on. */
export interface RuntimeAdapter {
  readonly name: RuntimeName;
  /** Runtime version, for diagnostics. */
  readonly version: string;
  /**
   * Starts a listener.
   * @param options - Address, port and fetch handler.
   * @returns The bound server.
   */
  readonly serve: (options: RuntimeServeOptions) => Promise<RuntimeServer>;
  /** Hono WebSocket upgrade helper that works with this adapter's `serve`. */
  readonly upgradeWebSocket: UpgradeWebSocket;
  /** Filesystem access, or undefined when the runtime has none. */
  readonly files: RuntimeFiles | undefined;
  readonly crypto: RuntimeCrypto;
  readonly environment: RuntimeEnvironment;
  /** Child processes and executables, for tooling and development servers. */
  readonly processes: RuntimeProcesses;
  /** Module resolution and the evictable registry, for tooling and development reloads. */
  readonly modules: RuntimeModules;
}
