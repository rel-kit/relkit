/**
 * The development reload hook a generated server installs when `relkit dev` starts it with
 * an IPC channel. On a `relkit.dev.reload` message it evicts the application modules that
 * changed since the last load, together with their importers, imports the new generation's
 * manifest module from the server directory (which re-evaluates exactly those modules),
 * verifies it against the new graph like startup does, and swaps the handler table. The
 * reply says whether the swap happened; on failure the previous table keeps serving and
 * `relkit dev` falls back to starting a new generation.
 */
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { currentRuntime } from "../runtime/current-runtime.js";
import { createModuleReloader } from "./dev-module-reload.js";
import type {
  DevelopmentReloadOptions,
  DevelopmentReloadReply,
  DevelopmentReloadRequest,
  ReloadedManifest,
} from "./dev-handler-table.types.js";
export type {
  DevelopmentReloadOptions,
  DevelopmentReloadReply,
  DevelopmentReloadRequest,
} from "./dev-handler-table.types.js";

/** Manifest maps the materialized HTTP application and workers hold on to. */
const FIXED_MAPS = [
  "middleware",
  "hooks",
  "requestTransforms",
  "agents",
  "tools",
  "channels",
  "tasks",
  "jobs",
] as const;

/**
 * Listens for reload requests on the process IPC channel.
 * @param options - Server directory, handler table and registry verification.
 * @returns Whether the hook was installed; false without an IPC channel.
 */
export function installDevelopmentReload(options: DevelopmentReloadOptions): boolean {
  if (typeof process.send !== "function") return false;
  // On a runtime without an evictable registry every request is answered as not applied, and
  // `relkit dev` starts a new generation instead.
  const loading = currentRuntime().then((runtime) => {
    const reloader = createModuleReloader(options.projectRoot, runtime.modules);
    reloader.record();
    return reloader;
  });
  void loading.catch(() => undefined);
  let queue = Promise.resolve();
  let applied = options.runtimeManifest;
  process.on("message", (message) => {
    if (!isReloadRequest(message)) return;
    // Requests are applied one at a time, in the order `relkit dev` sent them.
    queue = queue.then(async () => {
      const { reply, manifest } = await reload(options, loading, applied, message);
      if (manifest !== undefined) applied = manifest;
      process.send?.(reply);
    });
  });
  // The channel must not keep a stopping server alive.
  process.channel?.unref();
  return true;
}

/**
 * Applies one reload request.
 * @param options - Hook inputs.
 * @param loading - Module tracking for this process, once the runtime adapter loaded.
 * @param applied - Manifest of the table currently serving.
 * @param request - Accepted request.
 * @returns The acknowledgement and, after a swap, the manifest now serving.
 */
async function reload(
  options: DevelopmentReloadOptions,
  loading: Promise<ReturnType<typeof createModuleReloader>>,
  applied: ReloadedManifest,
  request: DevelopmentReloadRequest,
): Promise<{ readonly reply: DevelopmentReloadReply; readonly manifest?: ReloadedManifest }> {
  try {
    const reloader = await loading;
    // Stamps from before the import: a save landing while modules load is reported next time.
    const before = reloader.stamps();
    const evicted = reloader.invalidate(reloader.changed());
    const module = (await import(
      pathToFileURL(join(options.serverDirectory, request.manifest)).href
    )) as { readonly runtimeManifest?: ReloadedManifest };
    const manifest = module.runtimeManifest;
    if (manifest === undefined) throw new Error(`${request.manifest} exports no runtimeManifest.`);
    const fixed = changedFixedEntry(applied, manifest);
    if (fixed !== undefined) throw new Error(`${fixed} was re-evaluated; a restart is required.`);
    const graph = JSON.parse(await readFile(join(options.serverDirectory, request.graph), "utf8"));
    const next = options.createRegistry(graph, manifest);
    options.table.swap(next, manifest);
    reloader.record(before);
    const reimported = evicted.map((file) =>
      relative(options.projectRoot, file).replaceAll("\\", "/"),
    );
    return {
      reply: {
        type: "relkit.dev.reloaded",
        id: request.id,
        ok: true,
        reimported,
        pid: process.pid,
      },
      manifest,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reply: {
        type: "relkit.dev.reloaded",
        id: request.id,
        ok: false,
        error: message,
        pid: process.pid,
      },
    };
  }
}

/**
 * Finds a manifest entry, outside functions, targets, services and routes, that changed
 * identity; the running HTTP application and workers captured those at startup.
 * @param previous - Manifest currently serving.
 * @param next - Newly imported manifest.
 * @returns The first changed entry, or undefined when only swappable entries changed.
 */
function changedFixedEntry(previous: ReloadedManifest, next: ReloadedManifest): string | undefined {
  if (previous.application !== next.application) return "application";
  for (const map of FIXED_MAPS) {
    const before = previous[map] ?? {};
    const after = next[map] ?? {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (before[id] !== after[id]) return `${map}.${id}`;
  }
  return undefined;
}

/**
 * Recognizes a reload request on the shared IPC channel.
 * @param message - Deserialized IPC message.
 * @returns Whether it is a well-formed reload request.
 */
function isReloadRequest(
  message: object | string | number | boolean | null,
): message is DevelopmentReloadRequest {
  if (message === null || typeof message !== "object") return false;
  const record = message as Partial<DevelopmentReloadRequest>;
  return (
    record.type === "relkit.dev.reload" &&
    typeof record.id === "number" &&
    typeof record.manifest === "string" &&
    typeof record.graph === "string"
  );
}
