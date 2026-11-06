/**
 * Runs the Workers-compatible clients' conformance checks inside the Workers runtime: a pinned
 * `wrangler dev` serves `conformance/workers-conformance.worker.mjs` in workerd with a local KV
 * namespace, a local R2 bucket and an HTTP Redis endpoint (a proxy in front of a real Redis), and
 * the test asserts every check passed. Opt in with RELKIT_TEST_WORKERS=1 (wrangler is downloaded on
 * first use) and give a Redis server as REDIS_URL, or set RELKIT_TEST_DOCKER=1 to start one.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { startRedisHttpProxy, type RedisHttpProxy } from "./conformance/redis-http-proxy.ts";

/** Wrangler release that serves the Worker; the same pin as the runtime HTTP suite. */
const WRANGLER = "wrangler@4.151.3";
const REDIS_IMAGE =
  "redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952";
const enabled = process.env.RELKIT_TEST_WORKERS === "1";
const worker = fileURLToPath(
  new URL("./conformance/workers-conformance.worker.mjs", import.meta.url),
);
const redisRuntime = fileURLToPath(new URL("../../redis/dist/runtime/index.js", import.meta.url));

let directory = "";
let container = "";
let proxy: RedisHttpProxy | undefined;
let wrangler: ReturnType<typeof spawn> | undefined;
let port = 0;

beforeAll(async () => {
  if (!enabled) return;
  directory = await mkdtemp(join(tmpdir(), "relkit-workers-conformance-"));
  proxy = await startRedisHttpProxy(await redisUrl(), "conformance-token");
  const config = join(directory, "wrangler.jsonc");
  await writeFile(
    config,
    JSON.stringify(
      {
        name: "relkit-workers-conformance",
        main: worker,
        compatibility_date: "2026-10-01",
        compatibility_flags: ["nodejs_compat"],
        alias: { "@relkit/redis/runtime": redisRuntime },
        kv_namespaces: [{ binding: "CACHE", id: "relkit-conformance-cache" }],
        r2_buckets: [{ binding: "UPLOADS", bucket_name: "relkit-conformance-uploads" }],
        durable_objects: {
          bindings: [{ name: "RELKIT_REALTIME", class_name: "RelkitRealtimeState" }],
        },
        migrations: [{ tag: "v1", new_sqlite_classes: ["RelkitRealtimeState"] }],
        vars: { REDIS_HTTP_URL: proxy.url },
      },
      null,
      2,
    ),
  );
  port = await freePort();
  wrangler = spawn(
    process.execPath,
    ["x", WRANGLER, "dev", "--config", config, "--ip", "127.0.0.1", "--port", String(port)],
    {
      cwd: directory,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const ready = await fetch(`http://127.0.0.1:${port}/ready`).then(
      (response) => response.ok,
      () => false,
    );
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("wrangler dev did not serve the conformance Worker within 180 seconds");
}, 200_000);

afterAll(async () => {
  wrangler?.kill("SIGTERM");
  await proxy?.stop();
  if (container !== "") spawnSync("docker", ["stop", container]);
  if (directory !== "") await rm(directory, { recursive: true, force: true });
});

(enabled ? test : test.skip)(
  "Redis over HTTP, KV, R2 and Durable Object realtime pass the shared suites in workerd",
  async () => {
    const response = await fetch(`http://127.0.0.1:${port}/run`);
    const body = (await response.json()) as {
      readonly runtime: string;
      readonly results: readonly {
        name: string;
        ok: boolean;
        error?: string;
        cases?: Record<string, string>;
      }[];
    };
    expect(body.runtime).toBe("Cloudflare-Workers");
    expect(body.results.filter((result) => !result.ok)).toEqual([]);
    expect(body.results.map((result) => result.name)).toEqual([
      "runtime is workers",
      "redis over HTTP: protocol",
      "redis over HTTP: cache",
      "redis socket URL is refused on Workers",
      "KV binding: cache",
      "R2 binding: bucket",
      "Durable Object realtime: two providers share one channel",
      "missing binding names itself",
    ]);
    const skipped = Object.fromEntries(
      body.results
        .filter((result) => result.cases !== undefined)
        .map((result) => [
          result.name,
          Object.keys(result.cases!).filter((id) => result.cases![id] === "skip"),
        ]),
    );
    expect(skipped).toEqual({
      "redis over HTTP: cache": [],
      "KV binding: cache": ["increment"],
      "R2 binding: bucket": ["signed-urls", "closed"],
      "Durable Object realtime: two providers share one channel": [],
    });
  },
  60_000,
);

/**
 * Finds the Redis server: REDIS_URL, or a Docker container with RELKIT_TEST_DOCKER=1.
 * @returns Its `redis://` URL.
 */
async function redisUrl(): Promise<string> {
  if (process.env.REDIS_URL !== undefined) return process.env.REDIS_URL;
  if (process.env.RELKIT_TEST_DOCKER !== "1")
    throw new Error("Set REDIS_URL, or RELKIT_TEST_DOCKER=1 to start Redis in Docker.");
  container = command("docker", ["run", "--detach", "--rm", "-p", "127.0.0.1::6379", REDIS_IMAGE]);
  const mapped = command("docker", ["port", container, "6379/tcp"]).split(":").at(-1);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ping = spawnSync("docker", ["exec", container, "redis-cli", "ping"], {
      encoding: "utf8",
    });
    if (ping.stdout.trim() === "PONG") return `redis://127.0.0.1:${mapped}`;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Redis did not start");
}

/** @returns A port no listener holds right now. */
async function freePort(): Promise<number> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const value = probe.port ?? 0;
  await probe.stop(true);
  return value;
}

/**
 * Runs one command and returns its trimmed output.
 * @param executable - Program.
 * @param args - Arguments.
 * @returns Standard output.
 */
function command(executable: string, args: readonly string[]): string {
  const result = spawnSync(executable, [...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
