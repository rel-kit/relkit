/**
 * The Node runtime adapter: Hono's Node server with its `ws` WebSocket upgrades, `fs.openAsBlob`
 * file bodies, `node:crypto` hashing, `node:child_process` and `require.resolve` for tooling.
 */
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { upgradeWebSocket as nodeUpgradeWebSocket } from "@hono/node-server";
import type { UpgradeWebSocket } from "hono/ws";
import { getMimeType } from "hono/utils/mime";
import { processEnvironment } from "../process-environment.js";
import type { RuntimeAdapter, RuntimeFileBody } from "../runtime-adapter.types.js";
import { nodeModules } from "./modules.js";
import { nodeProcesses } from "./processes.js";
import { serve } from "./serve.js";

/** Hono WebSocket upgrade helper for the Node listener; the socket is `ws`'s WebSocket. */
export const upgradeWebSocket: UpgradeWebSocket = nodeUpgradeWebSocket as UpgradeWebSocket;

/** Runtime adapter for Node. */
export const nodeRuntime: RuntimeAdapter = Object.freeze({
  name: "node",
  version: process.versions.node,
  serve,
  upgradeWebSocket,
  files: Object.freeze({
    open: async (path: string) => {
      const info = await stat(path);
      const blob = await openAsBlob(path, { type: getMimeType(path) ?? "" });
      // Node's Blob is the standard Blob; Bun's declarations add members it does not need.
      return { blob: blob as unknown as RuntimeFileBody, lastModified: Math.trunc(info.mtimeMs) };
    },
  }),
  crypto: Object.freeze({
    sha256Hex: (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex"),
    randomUUID: () => crypto.randomUUID(),
  }),
  environment: processEnvironment,
  processes: nodeProcesses,
  modules: nodeModules,
});
