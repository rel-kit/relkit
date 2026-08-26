import { join, resolve } from "node:path";
import { API_BASE_PATH } from "@zsys/contracts";
import { DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS } from "@zsys/supervisor";
import { resolveApplicationPort } from "./ports.js";
import { readBuilt } from "./start-built.js";
export interface StartOptions {
  readonly projectRoot?: string;
  readonly buildDirectory?: string;
  readonly hostname?: string;
  readonly port?: number;
  readonly healthTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
  readonly spawn?: typeof Bun.spawn;
}
export interface StartedProject {
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly hostname: string;
  readonly port: number;
  readonly process: Bun.ReadableSubprocess;
  readonly exited: Promise<number>;
  readonly stop: () => Promise<void>;
}
/** Validates the built graph/manifest, waits for health/readiness, and owns shutdown. */
export async function startProject(options: StartOptions = {}): Promise<StartedProject> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const buildDirectory = resolve(options.buildDirectory ?? join(projectRoot, ".zsys", "build"));
  const built = await readBuilt(buildDirectory);
  const hostname = options.hostname ?? "127.0.0.1";
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const source = {
    ...inherited,
    ...Object.fromEntries(
      Object.entries(options.environment ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  };
  const port = await allocatePort(
    resolveApplicationPort({
      ...(options.port === undefined ? {} : { flag: options.port }),
      source,
      ...(built.manifest.server?.port === undefined
        ? {}
        : { configured: built.manifest.server.port }),
    }),
    hostname,
  );
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Start was aborted.");
  const environment = {
    ...source,
    PORT: String(port),
    ZSYS_GRAPH_HASH: built.graphHash,
  };
  const entrypoint = join(buildDirectory, built.manifest.containerEntrypoint);
  const spawn = options.spawn ?? Bun.spawn;
  const child = spawn(
    [process.execPath, "run", "--no-env-file", "--no-install", "--silent", entrypoint],
    {
      cwd: projectRoot,
      env: environment,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  void new Response(child.stdout).text();
  void new Response(child.stderr).text();
  let stopping: Promise<void> | undefined;
  let abort: (() => void) | undefined;
  const stop = async (): Promise<void> => {
    stopping ??= stopChild(child, options.stopTimeoutMs ?? 1_000);
    await stopping;
    if (abort !== undefined) options.signal?.removeEventListener("abort", abort);
  };
  abort = (): void => void stop();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    await waitForHealth(
      hostname,
      port,
      options.healthTimeoutMs ?? DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS,
      options.fetch ?? fetch,
      child,
    );
    return Object.freeze({
      projectRoot,
      buildDirectory,
      hostname,
      port,
      process: child,
      exited: child.exited,
      stop,
    });
  } catch (error) {
    await stop();
    options.signal?.removeEventListener("abort", abort);
    throw error;
  }
}
export async function runStart(options: StartOptions = {}): Promise<number> {
  const server = await startProject(options);
  return server.exited;
}
async function waitForHealth(
  hostname: string,
  port: number,
  timeoutMs: number,
  fetcher: typeof fetch,
  child: Bun.ReadableSubprocess,
): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new RangeError("healthTimeoutMs must be a positive safe integer.");
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Built server exited with code ${child.exitCode}.`);
    try {
      const live = await fetcher(`http://${hostname}:${port}${API_BASE_PATH}/health/live`);
      const ready = await fetcher(`http://${hostname}:${port}${API_BASE_PATH}/health/ready`);
      if (live.ok && ready.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.min(25, deadline - Date.now())),
    );
  }
  throw new Error(
    `Built server did not become ready${lastError instanceof Error ? `: ${lastError.message}` : "."}`,
  );
}
async function stopChild(child: Bun.ReadableSubprocess, timeoutMs: number): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
    throw new RangeError("stopTimeoutMs must be a non-negative safe integer.");
  if (child.exitCode === null) child.kill("SIGTERM");
  const exited = await Promise.race([
    child.exited.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await child.exited;
  }
}
async function allocatePort(port: number, hostname: string): Promise<number> {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw new RangeError("port must be between 0 and 65535.");
  if (port !== 0) return port;
  const probe = Bun.serve({ hostname, port: 0, fetch: () => new Response() });
  const allocated = probe.port;
  await probe.stop(true);
  if (allocated === undefined) throw new Error("Unable to allocate a start port.");
  return allocated;
}
