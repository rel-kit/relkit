import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  API_BASE_PATH,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@zsys/contracts";
import { hashGraph, type ApplicationGraph } from "@zsys/graph";
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
  const port = await resolvePort(options.port ?? Number(process.env.PORT ?? 3000), hostname);
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Start was aborted.");
  const environment = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    ...Object.fromEntries(
      Object.entries(options.environment ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    PORT: String(port),
    ZSYS_GRAPH_HASH: built.graphHash,
  };
  const entrypoint = join(buildDirectory, built.manifest.entrypoint);
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
      options.healthTimeoutMs ?? 2_000,
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
async function readBuilt(
  buildDirectory: string,
): Promise<{ readonly graphHash: string; readonly manifest: BuiltManifest }> {
  const graph = JSON.parse(
    await readFile(join(buildDirectory, "application.graph.json"), "utf8"),
  ) as ApplicationGraph;
  const manifest = JSON.parse(
    await readFile(join(buildDirectory, "manifest.json"), "utf8"),
  ) as BuiltManifest;
  if (
    graph.contractVersion !== CONTRACT_VERSION ||
    manifest.contractVersion !== CONTRACT_VERSION ||
    manifest.graphVersion !== GRAPH_VERSION ||
    manifest.manifestVersion !== MANIFEST_VERSION ||
    manifest.generatorVersion !== GENERATOR_VERSION
  )
    throw new Error("Built graph or manifest version is unsupported.");
  const graphHash = hashGraph(graph);
  if (manifest.graphHash !== graphHash)
    throw new Error("Built graph and manifest hashes do not match.");
  if (
    manifest.entrypoint !== "server/index.ts" ||
    manifest.runtimeManifestFile !== "server/runtime.manifest.ts"
  )
    throw new Error("Built manifest paths are invalid.");
  await access(join(buildDirectory, manifest.entrypoint));
  const runtimeManifest = await readFile(
    join(buildDirectory, manifest.runtimeManifestFile),
    "utf8",
  );
  if (!runtimeManifest.includes(`manifestGraphHash = ${JSON.stringify(graphHash)}`))
    throw new Error("Built runtime manifest hash does not match the graph.");
  return { graphHash, manifest };
}
interface BuiltManifest {
  readonly contractVersion: number;
  readonly generatorVersion: number;
  readonly graphVersion: number;
  readonly manifestVersion: number;
  readonly graphHash: string;
  readonly entrypoint: string;
  readonly runtimeManifestFile: string;
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
async function resolvePort(port: number, hostname: string): Promise<number> {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw new RangeError("port must be between 0 and 65535.");
  if (port !== 0) return port;
  const probe = Bun.serve({ hostname, port: 0, fetch: () => new Response() });
  const allocated = probe.port;
  await probe.stop(true);
  if (allocated === undefined) throw new Error("Unable to allocate a start port.");
  return allocated;
}
