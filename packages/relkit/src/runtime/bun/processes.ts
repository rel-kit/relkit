/**
 * Child processes, executables and modules on Bun: `Bun.spawn` with Bun's IPC channel,
 * `Bun.which`, `Bun.resolveSync`, and the registry Bun shares between `require.cache` and ES
 * modules, which lets the development reload evict a changed module.
 */
import type {
  RuntimeModules,
  RuntimeProcesses,
  RuntimeSourceLoader,
  RuntimeSpawnOptions,
  RuntimeSubprocess,
} from "../runtime-processes.types.js";

/**
 * Starts a Bun child process.
 * @param command - Executable and literal arguments.
 * @param options - Working directory, environment, streams and IPC.
 * @returns The child behind the runtime-neutral contract.
 */
function spawn(command: readonly string[], options: RuntimeSpawnOptions = {}): RuntimeSubprocess {
  const ipc = options.ipc;
  const child = Bun.spawn([...command], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: { ...options.env } }),
    stdin: options.stdin ?? "ignore",
    stdout: options.stdout ?? "pipe",
    stderr: options.stderr ?? "pipe",
    ...(ipc === undefined ? {} : { ipc: (message: unknown) => ipc(message) }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const sink = child.stdin;
  return {
    pid: child.pid,
    get exitCode() {
      return child.exitCode;
    },
    get signalCode() {
      return child.signalCode;
    },
    // Bun already resolves with 128 + the signal number after a signal.
    exited: child.exited,
    stdout: streamOf(child.stdout),
    stderr: streamOf(child.stderr),
    stdin:
      typeof sink === "object" && sink !== null && "write" in sink
        ? {
            write: (chunk) => void sink.write(chunk),
            end: async () => void (await sink.end()),
          }
        : undefined,
    kill: (signal) => child.kill(signal),
    send: (message) => child.send(message),
    unref: () => child.unref(),
  };
}

/**
 * Normalizes a Bun stdio value to a stream.
 * @param stream - Piped stream, or a number/undefined for an unpiped one.
 * @returns The stream, or an empty one.
 */
function streamOf(stream: unknown): ReadableStream<Uint8Array> {
  return stream instanceof ReadableStream
    ? (stream as ReadableStream<Uint8Array>)
    : new ReadableStream({ start: (controller) => controller.close() });
}

/** Child processes and executables on Bun. */
export const bunProcesses: RuntimeProcesses = Object.freeze({
  spawn,
  which: (executable: string, path?: string) =>
    Bun.which(executable, path === undefined ? {} : { PATH: path }),
});

/** Module resolution and Bun's evictable registry. */
export const bunModules: RuntimeModules = Object.freeze({
  resolve: (specifier: string, fromDirectory: string) =>
    Bun.resolveSync(specifier, fromDirectory).split("?", 1)[0] ?? specifier,
  registry: Object.freeze({
    keys: () => Object.keys(require.cache),
    evict: (key: string) => {
      delete require.cache[key];
    },
    scanImports: (source: string, loader: RuntimeSourceLoader) =>
      new Bun.Transpiler({ loader }).scanImports(source).map((entry) => entry.path),
  }),
});
