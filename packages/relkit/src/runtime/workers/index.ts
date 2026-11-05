/**
 * The Cloudflare Workers runtime adapter. A Worker has no listener, no filesystem and no child
 * processes: the platform calls the exported `fetch`, `scheduled` and `queue` handlers that
 * `relkit build --runtime workers` generates, static files come from Workers static assets, and
 * the isolate may be evicted between requests. Workers run with the `nodejs_compat` flag, which
 * provides `process.env`, `AsyncLocalStorage` and `node:crypto` hashing.
 */
import { createHash } from "node:crypto";
import { upgradeWebSocket as workersUpgradeWebSocket } from "hono/cloudflare-workers";
import type { UpgradeWebSocket } from "hono/ws";
import { processEnvironment } from "../process-environment.js";
import type { RuntimeAdapter, RuntimeServer } from "../runtime-adapter.types.js";
import type { RuntimeModules, RuntimeProcesses } from "../runtime-processes.types.js";

/**
 * Builds the error a Workers-only capability gap raises.
 * @param capability - What the caller asked for.
 * @returns An error that names the capability and the Workers model.
 */
function unsupported(capability: string): Error {
  return new Error(
    `Cloudflare Workers has no ${capability}; a Worker serves through its exported fetch handler.`,
  );
}

/** Hono WebSocket upgrade helper for Workers; the socket is the Worker's `WebSocketPair` side. */
export const upgradeWebSocket: UpgradeWebSocket =
  workersUpgradeWebSocket as unknown as UpgradeWebSocket;

const processes: RuntimeProcesses = Object.freeze({
  spawn: () => {
    throw unsupported("child processes");
  },
  which: () => null,
});

const modules: RuntimeModules = Object.freeze({
  resolve: (specifier: string) => {
    throw unsupported(`module resolution (asked for ${specifier})`);
  },
  registry: undefined,
});

/** Runtime adapter for Cloudflare Workers. */
export const workersRuntime: RuntimeAdapter = Object.freeze({
  name: "workers",
  version: globalThis.navigator?.userAgent ?? "Cloudflare-Workers",
  serve: (): Promise<RuntimeServer> => Promise.reject(unsupported("listener")),
  upgradeWebSocket,
  files: undefined,
  crypto: Object.freeze({
    sha256Hex: (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex"),
    randomUUID: () => crypto.randomUUID(),
  }),
  environment: processEnvironment,
  processes,
  modules,
});
