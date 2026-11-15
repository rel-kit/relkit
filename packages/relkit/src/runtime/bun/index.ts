/**
 * The Bun runtime adapter: `Bun.serve` with Hono's Bun WebSocket handler, `Bun.file` bodies and
 * Bun's native SHA-256, plus `Bun.spawn`, `Bun.which` and Bun's module registry for tooling.
 * This is the only place in `relkit` that calls `Bun.*`.
 */
import { upgradeWebSocket, websocket } from "hono/bun";
import type { BunWebSocketData } from "hono/bun";
import { processEnvironment } from "../process-environment.js";
import { bunModules, bunProcesses } from "./processes.js";
import { acceptedRequest, internalErrorResponse } from "./request-target.js";
import type {
  RuntimeAdapter,
  RuntimeServeOptions,
  RuntimeServer,
} from "../runtime-adapter.types.js";

/**
 * Starts a Bun listener whose fetch handler receives the Bun server as its request bindings.
 * @param options - Address, port and fetch handler.
 * @returns The bound server.
 */
async function serve(options: RuntimeServeOptions): Promise<RuntimeServer> {
  const server = Bun.serve<BunWebSocketData>({
    hostname: options.hostname,
    port: options.port,
    websocket,
    ...(options.maxRequestBodySize === undefined
      ? {}
      : { maxRequestBodySize: options.maxRequestBodySize }),
    // Never Bun's development error page, whatever NODE_ENV says: it shows source and paths.
    development: false,
    error: (error) => {
      console.error(error);
      return internalErrorResponse();
    },
    fetch: (request, bunServer) => {
      const accepted = acceptedRequest(request, bunServer.url.host);
      return accepted instanceof Response ? accepted : options.fetch(accepted, bunServer);
    },
  });
  return Object.freeze({
    port: server.port ?? options.port,
    stop: (force?: boolean) => server.stop(force),
  });
}

/** Runtime adapter for Bun. */
export const bunRuntime: RuntimeAdapter = Object.freeze({
  name: "bun",
  version: Bun.version,
  serve,
  upgradeWebSocket,
  files: Object.freeze({
    open: async (path: string) => {
      const file = Bun.file(path);
      return { blob: file, lastModified: file.lastModified };
    },
  }),
  crypto: Object.freeze({
    sha256Hex: (data: string | Uint8Array) => Bun.SHA256.hash(data, "hex"),
    randomUUID: () => crypto.randomUUID(),
  }),
  environment: processEnvironment,
  processes: bunProcesses,
  modules: bunModules,
});

export { upgradeWebSocket };
/** Hono's Bun WebSocket handler, for callers that start `Bun.serve` themselves. */
export const honoWebSocket = websocket;
