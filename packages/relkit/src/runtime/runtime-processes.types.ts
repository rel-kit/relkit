/**
 * Declares the process and module parts of the runtime adapter contract: spawning child
 * processes with optional IPC, locating executables, resolving modules and, where the runtime
 * exposes one, the module registry the development reload evicts from. Tooling (the CLI, the
 * creator and the development server's reload hook) uses these instead of `Bun.*` or
 * `node:child_process`, so it runs on every Tier 1 runtime.
 */

/** How one standard stream of a child process is connected. */
export type RuntimeStdio = "pipe" | "inherit" | "ignore";

/** Settings for one child process. */
export interface RuntimeSpawnOptions {
  /** Working directory; defaults to the current one. */
  readonly cwd?: string;
  /** Complete environment of the child; defaults to the parent's. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Defaults to `ignore`. */
  readonly stdin?: RuntimeStdio;
  /** Defaults to `pipe`. */
  readonly stdout?: RuntimeStdio;
  /** Defaults to `pipe`. */
  readonly stderr?: RuntimeStdio;
  /**
   * Opens an IPC channel to a child running on the same runtime and receives its messages.
   * @param message - Deserialized message the child sent with `process.send`.
   */
  readonly ipc?: (message: unknown) => void;
  /** Kills the child when aborted. */
  readonly signal?: AbortSignal;
}

/** Writable standard input of a child started with `stdin: "pipe"`. */
export interface RuntimeStdin {
  /**
   * Queues bytes or UTF-8 text.
   * @param chunk - Data to write.
   */
  readonly write: (chunk: string | Uint8Array) => void;
  /** @returns Completion once queued data is flushed and the stream is closed. */
  readonly end: () => Promise<void>;
}

/** A running or exited child process. */
export interface RuntimeSubprocess {
  /** Operating-system process id. */
  readonly pid: number;
  /** Exit status once the child exited normally; null while running or after a signal. */
  readonly exitCode: number | null;
  /** Terminating signal name, when a signal ended the child. */
  readonly signalCode: string | null;
  /** Resolves with the exit status (128 + signal number after a signal) once the child exits. */
  readonly exited: Promise<number>;
  /** Piped standard output; an empty stream when not piped. */
  readonly stdout: ReadableStream<Uint8Array>;
  /** Piped standard error; an empty stream when not piped. */
  readonly stderr: ReadableStream<Uint8Array>;
  /** Piped standard input, when requested. */
  readonly stdin: RuntimeStdin | undefined;
  /**
   * Sends a signal; does nothing once the child exited.
   * @param signal - Signal name or number; defaults to `SIGTERM`.
   */
  readonly kill: (signal?: NodeJS.Signals | number) => void;
  /**
   * Sends one message over the IPC channel.
   * @param message - Structured-cloneable message.
   */
  readonly send: (message: unknown) => void;
  /** Lets the parent exit while the child still runs. */
  readonly unref: () => void;
}

/** Child processes and executables. */
export interface RuntimeProcesses {
  /**
   * Starts a child process.
   * @param command - Executable followed by its literal arguments.
   * @param options - Working directory, environment, streams and IPC.
   * @returns The started child; a missing executable throws synchronously.
   */
  readonly spawn: (command: readonly string[], options?: RuntimeSpawnOptions) => RuntimeSubprocess;
  /**
   * Finds an executable on `PATH`.
   * @param executable - Command name.
   * @param path - Search path; defaults to the process `PATH`.
   * @returns Its absolute path, or null when absent.
   */
  readonly which: (executable: string, path?: string) => string | null;
}

/** Source loaders whose imports a registry can scan. */
export type RuntimeSourceLoader = "ts" | "tsx" | "js" | "jsx";

/**
 * The runtime's ES module registry, which the development reload evicts changed modules from.
 * Only runtimes whose registry can drop an evaluated module expose it.
 */
export interface RuntimeModuleRegistry {
  /** @returns Every registry key, including query-string variants. */
  readonly keys: () => readonly string[];
  /**
   * Drops one module so its next import evaluates a fresh record.
   * @param key - Registry key from {@link keys}.
   */
  readonly evict: (key: string) => void;
  /**
   * Lists a module's static and dynamic import specifiers.
   * @param source - Module source text.
   * @param loader - Loader for its extension.
   * @returns Specifiers in source order; throws when the source does not parse.
   */
  readonly scanImports: (source: string, loader: RuntimeSourceLoader) => readonly string[];
}

/** Module resolution and registry access. */
export interface RuntimeModules {
  /**
   * Resolves a specifier as an ES module import from a directory would.
   * @param specifier - Package, relative or absolute specifier.
   * @param fromDirectory - Directory of the importing module.
   * @returns Absolute file path; throws when nothing matches.
   */
  readonly resolve: (specifier: string, fromDirectory: string) => string;
  /** The evictable module registry, or undefined when the runtime has none (Node). */
  readonly registry: RuntimeModuleRegistry | undefined;
}
