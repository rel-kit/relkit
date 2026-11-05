/**
 * Child processes and executables on Node: `node:child_process` with Node's IPC channel (the
 * structured-clone serialization Bun's channel uses), web streams over the piped output, and a
 * `PATH` search for executables.
 */
import { spawn as nodeSpawn, type StdioOptions } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { constants } from "node:os";
import { delimiter, join } from "node:path";
import { Readable } from "node:stream";
import type {
  RuntimeProcesses,
  RuntimeSpawnOptions,
  RuntimeStdin,
  RuntimeSubprocess,
} from "../runtime-processes.types.js";

/**
 * Starts a Node child process.
 * @param command - Executable and literal arguments.
 * @param options - Working directory, environment, streams and IPC.
 * @returns The child; a missing executable throws synchronously, as on Bun.
 */
function spawn(command: readonly string[], options: RuntimeSpawnOptions = {}): RuntimeSubprocess {
  const [file, ...args] = command;
  if (file === undefined) throw new TypeError("spawn needs an executable.");
  const stdio: StdioOptions = [
    options.stdin ?? "ignore",
    options.stdout ?? "pipe",
    options.stderr ?? "pipe",
    ...(options.ipc === undefined ? [] : ["ipc" as const]),
  ];
  const child = nodeSpawn(file, args, {
    stdio,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: { ...options.env } }),
    ...(options.ipc === undefined ? {} : { serialization: "advanced" as const }),
    ...(options.signal === undefined ? {} : { signal: options.signal, killSignal: "SIGKILL" }),
  });
  let failure: Error | undefined;
  child.on("error", (cause) => {
    failure ??= cause;
  });
  if (child.pid === undefined) {
    const error = new Error(`Executable not found: ${file}`, { cause: failure });
    Object.assign(error, { code: "ENOENT", path: file });
    throw error;
  }
  const ipc = options.ipc;
  if (ipc !== undefined) child.on("message", (message) => ipc(message));
  const exited = new Promise<number>((resolve) => {
    child.once("exit", (code, signal) =>
      resolve(code ?? (signal === null ? 1 : 128 + (constants.signals[signal] ?? 0))),
    );
  });
  const pid = child.pid;
  return {
    pid,
    get exitCode() {
      return child.exitCode;
    },
    get signalCode() {
      return child.signalCode;
    },
    exited,
    stdout: webStream(child.stdout),
    stderr: webStream(child.stderr),
    stdin: child.stdin === null ? undefined : stdinOf(child.stdin),
    kill: (signal) => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    },
    send: (message) => {
      if (!child.connected) throw new Error("The child's IPC channel is closed.");
      child.send(message as object);
    },
    unref: () => {
      child.unref();
      child.channel?.unref();
    },
  };
}

/**
 * Converts a piped Node stream to a web stream.
 * @param stream - Piped output, or null when not piped.
 * @returns A byte stream; empty when not piped.
 */
function webStream(stream: Readable | null): ReadableStream<Uint8Array> {
  if (stream === null) return new ReadableStream({ start: (controller) => controller.close() });
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

/**
 * Wraps a child's standard input.
 * @param stream - Writable standard input.
 * @returns Writes and a flushing close.
 */
function stdinOf(stream: NodeJS.WritableStream): RuntimeStdin {
  // A child that exits before reading its input closes the pipe; that is not the parent's error.
  stream.on("error", () => undefined);
  return {
    write: (chunk) => void stream.write(chunk),
    end: () => new Promise<void>((resolve) => stream.end(() => resolve())),
  };
}

/**
 * Finds an executable on a search path.
 * @param executable - Command name, or a path containing a separator.
 * @param path - Search path; defaults to `PATH`.
 * @returns Absolute path of the first executable regular file, or null.
 */
function which(executable: string, path = process.env["PATH"] ?? ""): string | null {
  const extensions =
    process.platform === "win32" ? (process.env["PATHEXT"] ?? ".EXE;.CMD").split(";") : [""];
  const candidates = executable.includes("/")
    ? [executable]
    : path
        .split(delimiter)
        .filter(Boolean)
        .map((directory) => join(directory, executable));
  for (const candidate of candidates)
    for (const extension of extensions)
      try {
        const file = candidate + extension;
        if (!statSync(file).isFile()) continue;
        accessSync(file, fsConstants.X_OK);
        return file;
      } catch {
        continue;
      }
  return null;
}

/** Child processes and executables on Node. */
export const nodeProcesses: RuntimeProcesses = Object.freeze({ spawn, which });
