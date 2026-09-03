import type { DevLogEvent, DevLog } from "./dev.js";
import { assertPortAvailable } from "./port-availability.js";
import { captureOutputLines } from "@relkit/supervisor";

export interface DevInspectorOptions {
  readonly command: readonly string[];
  readonly hostname?: string;
  readonly port?: number;
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxOutputBytes?: number;
  readonly stopTimeoutMs?: number;
}

export interface DevInspector {
  readonly port: number;
  readonly process: Bun.ReadableSubprocess;
  readonly output: Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function startInspector(
  options: DevInspectorOptions,
  backendPort: number,
  log: DevLog,
  spawn: typeof Bun.spawn = Bun.spawn,
): Promise<DevInspector> {
  if (options.command.length === 0) throw new TypeError("Inspector command cannot be empty.");
  const hostname = options.hostname ?? "127.0.0.1";
  const port = await resolvePort(options.port ?? 3210, hostname);
  const stopTimeoutMs = options.stopTimeoutMs ?? 1_000;
  if (!Number.isSafeInteger(stopTimeoutMs) || stopTimeoutMs < 0)
    throw new RangeError("Inspector stop timeout must be a non-negative safe integer.");
  const environment = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    ...options.environment,
    PORT: String(port),
    HOSTNAME: hostname,
    RELKIT_INSPECTOR_PORT: String(port),
    RELKIT_BACKEND_PORT: String(backendPort),
    RELKIT_BACKEND_URL: `http://${hostname}:${backendPort}`,
    NEXT_PUBLIC_RELKIT_BACKEND_URL: `http://${hostname}:${port}/_relkit/backend`,
  };
  const child = spawn([...options.command], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    capture(child.stdout, "stdout", options.maxOutputBytes ?? 64 * 1024, log),
    capture(child.stderr, "stderr", options.maxOutputBytes ?? 64 * 1024, log),
  ]).then(() => undefined);
  const stop = createStopper(child, stopTimeoutMs);
  return Object.freeze({ port, process: child, output, stop });
}

async function resolvePort(port: number, hostname: string): Promise<number> {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw new RangeError("Inspector port must be between 0 and 65535.");
  if (port !== 0) {
    await assertPortAvailable(port, hostname, "--inspector-port");
    return port;
  }
  const server = Bun.serve({ hostname, port: 0, fetch: () => new Response() });
  const allocated = server.port;
  await server.stop(true);
  if (allocated === undefined) throw new Error("Bun did not allocate an inspector port.");
  return allocated;
}

async function capture(
  stream: ReadableStream<Uint8Array>,
  channel: "stdout" | "stderr",
  limit: number,
  log: DevLog,
): Promise<void> {
  try {
    await captureOutputLines(
      stream,
      (output) =>
        log({
          level: channel === "stderr" ? "warn" : "info",
          event: "inspector.output",
          fields: { channel, output },
        }),
      { maxBytes: limit },
    );
  } catch (error) {
    log({
      level: "warn",
      event: "inspector.output.failed",
      fields: { message: errorMessage(error) },
    });
  }
}

function createStopper(child: Bun.ReadableSubprocess, timeoutMs: number): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= stopChild(child, timeoutMs);
    return stopping;
  };
}

async function stopChild(child: Bun.ReadableSubprocess, timeoutMs: number): Promise<void> {
  if (child.exitCode === null) child.kill("SIGTERM");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exited = await Promise.race([
    child.exited.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
