/**
 * RK-42 through the development proxy: a worker on this runtime's adapter with RelKit's body limit
 * (1 MiB, the default) behind a real supervisor proxy, and a Node client that streams bodies over
 * the limit with Node's `fetch` and with `node:http`. Shared by the Bun and Node proxy suites.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RegistrationPlan } from "relkit/graph";
import { loadRuntimeAdapter } from "relkit/runtime";
import { createApp } from "relkit/runtime-hono";
import { instrumentHttpRequest } from "relkit/runtime-hono/prepared";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "relkit/contracts";
import { createSupervisorProxy } from "../../../src/supervisor/proxy.js";

/** The default body limit. */
export const STREAM_LIMIT = 1_048_576;

const CLIENT = fileURLToPath(new URL("./oversize-stream.client.mjs", import.meta.url));

/** The client's tally for one way of sending. */
export interface OversizeTally {
  /** Answers that were 413 `payload-too-large` with a request id within 5 s. */
  readonly ok: number;
  /** How often each other outcome happened, keyed `<size>:<status or error>`. */
  readonly failures: Readonly<Record<string, number>>;
  /** How often a follow-up request was not answered 200, keyed `<size>:<status or error>`. */
  readonly followUpFailures: Readonly<Record<string, number>>;
  /** The slowest answer or error, in milliseconds. */
  readonly slowestMs: number;
}

/**
 * Builds a trigger the worker serves with a raw handler.
 * @param id - Trigger and handler ID.
 * @param method - HTTP method.
 * @param path - Route path.
 * @returns The trigger.
 */
function trigger(id: string, method: string, path: string) {
  return {
    kind: "trigger",
    id,
    source: { file: "route.ts", line: 1, column: 1 },
    triggerType: "http",
    targetFunctionId: id,
    config: {
      method,
      path,
      rawHandler: true,
      request: {},
      responses: [],
      middleware: [],
      transforms: [],
    },
  };
}

/**
 * Starts the worker and a proxy in front of it.
 * @returns The proxy port and a stop function.
 */
export async function startOversizeProxy(): Promise<{
  port: number;
  workerPort: number;
  stop: () => Promise<void>;
}> {
  const graphHash = "sha256:proxy-oversize-stream";
  const plan = {
    graphHash,
    functions: [],
    httpTriggers: [
      trigger("echo.post", "POST", "/echo"),
      trigger("echo.patch", "PATCH", "/echo"),
      trigger("ok.read", "GET", "/ok"),
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [],
    middlewares: [],
  } as unknown as RegistrationPlan;
  const echo = async (request: Request) =>
    Response.json({ bytes: (await request.arrayBuffer()).byteLength });
  const app = createApp({
    plan,
    manifest: {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash,
      activationFingerprint: {
        graphHash,
        manifestHash: "sha256:test-manifest",
        runtimeIntegrationsPlanHash: "sha256:test-runtime-integrations",
      },
      runtimeIntegrationsPlan: {
        version: RUNTIME_INTEGRATION_PLAN_VERSION,
        fileName: RUNTIME_INTEGRATION_PLAN_FILE,
        graphHash,
      },
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {
        "echo.post": { handler: echo },
        "echo.patch": { handler: echo },
        "ok.read": { handler: () => Response.json({ ok: true }) },
      },
    },
    engine: { invoke: async () => undefined },
    middleware: { maxBodyBytes: STREAM_LIMIT },
  });
  const options = { maxBodyBytes: STREAM_LIMIT };
  const runtime = await loadRuntimeAdapter(
    typeof process.versions.bun === "string" ? "bun" : "node",
  );
  const upstream = await runtime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => instrumentHttpRequest(request, options, (inner) => app.fetch(inner)),
  });
  const proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  return {
    port: proxy.port,
    workerPort: upstream.port,
    stop: async () => {
      await proxy.stop();
      await upstream.stop(true);
    },
  };
}

/**
 * Runs the streaming client in a Node process against a server.
 * @param origin - Server origin, such as `http://127.0.0.1:4100`.
 * @param mode - `fetch` sends a string body with Node's fetch; `http` writes chunks with `node:http`.
 * @param count - Attempts for each body size.
 * @param path - Route that receives the bodies.
 * @param followUp - Route the follow-up `GET` asks for.
 * @returns The client's tally.
 */
export async function runOversizeClient(
  origin: string,
  mode: "fetch" | "http",
  count: number,
  path = "/echo",
  followUp = "/ok",
): Promise<OversizeTally> {
  const child = spawn(
    "node",
    [CLIENT, origin, mode, String(count), String(STREAM_LIMIT), path, followUp],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (code !== 0) throw new Error(`Oversize client exited ${code}: ${output}`);
  return JSON.parse(output) as OversizeTally;
}
