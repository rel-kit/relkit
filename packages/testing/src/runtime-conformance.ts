/**
 * Shared runtime adapter conformance suite. The Bun, Node and Workers adapters run these cases
 * inside the runtime they adapt, and a new adapter runs the same ones. The full HTTP behavior of a
 * built application (static files, WebSocket echo, streaming) stays in the runtime HTTP suite.
 */
import type { ConformanceHarness } from "./conformance.types.js";
import type {
  RuntimeConformanceCase,
  RuntimeConformanceCaseId,
  RuntimeConformanceOptions,
} from "./runtime-conformance.types.js";
import { check, conformanceHarness, rejects, SKIPPED } from "./conformance.js";

export type * from "./runtime-conformance.types.js";

/** The cases every runtime adapter passes. */
export const RUNTIME_CONFORMANCE_CASES: readonly RuntimeConformanceCase[] = Object.freeze([
  { id: "naming", description: "the adapter names a known runtime and its version" },
  { id: "crypto", description: "SHA-256 and random UUIDs match the standard" },
  { id: "environment", description: "variables read back and unset ones are undefined" },
  { id: "serve", description: "a listener serves requests, or an isolate refuses to listen" },
  { id: "websocket-helper", description: "upgradeWebSocket builds Hono middleware" },
  { id: "files", description: "files open lazily, or an isolate has no filesystem" },
  { id: "processes", description: "children run and report output, or an isolate refuses" },
  { id: "modules", description: "packages resolve to files, or an isolate refuses" },
]);

const SHA256_RELKIT = "e67d8d2fc1c95ca0217021500b89d7194d45b375d7b5d98dd48e079f69f34896";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Creates the runtime conformance harness for one adapter. Run it inside the runtime the adapter
 * adapts.
 * @param options - The adapter, its kind and the fixtures the process cases need.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createRuntimeConformanceHarness } from "@relkit/testing/runtime-conformance";
 * import { nodeRuntime } from "relkit/runtime/node";
 *
 * const harness = createRuntimeConformanceHarness({
 *   adapter: nodeRuntime,
 *   kind: "process",
 *   executable: process.execPath,
 * });
 * console.log((await runConformance(harness)).results);
 * ```
 */
export function createRuntimeConformanceHarness(
  options: RuntimeConformanceOptions,
): ConformanceHarness<RuntimeConformanceCaseId> {
  const { adapter } = options;
  const isolate = options.kind === "isolate";
  return conformanceHarness("runtime", RUNTIME_CONFORMANCE_CASES, {
    naming: async () => {
      check(["bun", "node", "workers"].includes(adapter.name), "a known runtime", adapter.name);
      check(adapter.version.length > 0, "a version", adapter.version);
    },
    crypto: async () => {
      check(adapter.crypto.sha256Hex("relkit") === SHA256_RELKIT, "SHA-256 of text");
      const bytes = new TextEncoder().encode("relkit");
      check(adapter.crypto.sha256Hex(bytes) === SHA256_RELKIT, "SHA-256 of bytes");
      const [first, second] = [adapter.crypto.randomUUID(), adapter.crypto.randomUUID()];
      check(UUID_V4.test(first) && first !== second, "distinct version 4 UUIDs", [first, second]);
    },
    environment: async () => {
      const unset = `RELKIT_CONFORMANCE_UNSET_${adapter.crypto.randomUUID().slice(0, 8)}`;
      check(adapter.environment.get(unset) === undefined, "an unset variable is undefined");
      const snapshot = adapter.environment.snapshot();
      check(
        Object.values(snapshot).every((value) => typeof value === "string"),
        "string values",
      );
      if (options.environment === undefined) return;
      const { name, value } = options.environment;
      check(adapter.environment.get(name) === value, "get reads the variable", name);
      check(snapshot[name] === value, "the snapshot holds the variable", name);
    },
    serve: async () => {
      if (isolate) return rejects(() => adapter.serve(server(adapter.name)), "serve on an isolate");
      const listener = await adapter.serve(server(adapter.name));
      try {
        check(listener.port > 0, "the listener reports its port", listener.port);
        const base = `http://127.0.0.1:${listener.port}`;
        const got = await fetch(`${base}/path?q=1`);
        check((await got.text()) === `${adapter.name} GET /path?q=1 `, "a GET round-trips");
        const posted = await fetch(`${base}/echo`, { method: "POST", body: "payload" });
        check((await posted.text()) === `${adapter.name} POST /echo payload`, "a body arrives");
      } finally {
        await listener.stop(true);
      }
    },
    "websocket-helper": async () => {
      const middleware: unknown = adapter.upgradeWebSocket(() => ({}));
      check(typeof middleware === "function", "upgradeWebSocket returns middleware");
    },
    files: async () => {
      if (isolate) return check(adapter.files === undefined, "an isolate has no files");
      if (options.file === undefined || adapter.files === undefined) return SKIPPED;
      const file = await adapter.files.open(options.file.path);
      check((await file.blob.text()) === options.file.contents, "the file reads back");
      check(file.lastModified > 0, "a modification time", file.lastModified);
      const head = options.file.contents.slice(0, 2);
      check((await file.blob.slice(0, 2).text()) === head, "a byte range reads alone");
    },
    processes: async () => {
      check(adapter.processes.which("relkit-conformance-no-such-command") === null, "which");
      if (isolate)
        return rejects(async () => adapter.processes.spawn(["echo", "x"]), "spawn on an isolate");
      if (options.executable === undefined) return SKIPPED;
      const child = adapter.processes.spawn([
        options.executable,
        "-e",
        "process.stdout.write('ok')",
      ]);
      const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      check(code === 0 && output === "ok", "a child runs and reports output", { code, output });
    },
    modules: async () => {
      if (isolate)
        return rejects(async () => adapter.modules.resolve("relkit", "/"), "resolve on an isolate");
      if (options.resolveFrom === undefined) return SKIPPED;
      const resolved = adapter.modules.resolve("relkit", options.resolveFrom);
      check(/[\\/]/.test(resolved) && /\.[cm]?js$/.test(resolved), "a file path", resolved);
    },
  });
}

/**
 * Listener settings for the `serve` case: answers with the runtime, method, path and body.
 * @param name - Runtime name echoed in responses.
 * @returns Serve options on an ephemeral port.
 */
function server(name: string) {
  return {
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const body = request.method === "GET" ? "" : await request.text();
      return new Response(`${name} ${request.method} ${url.pathname}${url.search} ${body}`);
    },
  };
}
