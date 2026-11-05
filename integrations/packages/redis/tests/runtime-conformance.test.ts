/**
 * Runs the Redis conformance module on Bun and on Node against one Docker Redis. Opt in with
 * RELKIT_TEST_DOCKER=1, as the local Docker services test does.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "bun:test";

const IMAGE =
  "redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952";
const MODULE = fileURLToPath(new URL("./conformance/redis-conformance.mjs", import.meta.url));
const docker = process.env.RELKIT_TEST_DOCKER === "1";
let container = "";
let url = "";

beforeAll(async () => {
  if (!docker) return;
  container = command("docker", ["run", "--detach", "--rm", "-p", "127.0.0.1::6379", IMAGE]);
  const port = command("docker", ["port", container, "6379/tcp"]).split(":").at(-1);
  url = `redis://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ping = spawnSync("docker", ["exec", container, "redis-cli", "ping"], {
      encoding: "utf8",
    });
    if (ping.stdout.trim() === "PONG") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Redis did not start");
}, 120_000);

afterAll(() => {
  if (container !== "") spawnSync("docker", ["stop", container]);
});

(docker ? test : test.skip).each(["bun", "node"])(
  "cache, realtime and agent state pass on %s",
  (runtime) => {
    const result = spawnSync(runtime, [MODULE], {
      encoding: "utf8",
      env: { ...process.env, REDIS_URL: url },
    });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain(`Redis conformance passed on ${runtime}`);
  },
  60_000,
);

/**
 * Runs one command and returns its trimmed output.
 * @param executable - Program. @param args - Arguments. @returns Standard output.
 */
function command(executable: string, args: readonly string[]): string {
  const result = spawnSync(executable, [...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
