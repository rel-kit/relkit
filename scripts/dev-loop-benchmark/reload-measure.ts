/**
 * Measures save-to-serving latency against a running `relkit dev`. It starts the CLI from
 * this checkout in a generated application on a free port, waits for the edited route's
 * first correct response, then rewrites the handler `saves` times; each sample runs from
 * the file write to the first response that carries the new revision. The dev process
 * group is terminated and reaped before the measurement returns, also on failure.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { functionSource } from "./app-generator.js";
import type { BenchmarkApp, ReloadMeasurement, ReloadOptions } from "./benchmark.types.js";

/**
 * Starts dev, edits the handler repeatedly and records each save's latency.
 * @param app - Generated application.
 * @param options - CLI path, sample count and deadlines.
 * @returns Latency distribution and first-start time.
 * @throws When the server does not serve a revision before its deadline.
 */
export async function measureReloads(
  app: BenchmarkApp,
  options: ReloadOptions,
): Promise<ReloadMeasurement> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}${app.route}`;
  const startedAt = performance.now();
  const child = Bun.spawn([process.execPath, options.cli, "dev"], {
    cwd: app.root,
    env: { ...process.env, PORT: String(port), NO_COLOR: "1", RELKIT_INSPECTOR_PORT: undefined },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const output = collect(child);
  try {
    await waitForBody(url, "f0 v0", options.startDeadlineMs, output);
    const firstStartMs = performance.now() - startedAt;
    const samplesMs: number[] = [];
    for (let save = 1; save <= options.saves; save += 1) {
      await Bun.sleep(150);
      const revision = `v${save}`;
      const source = functionSource(0, revision);
      writeFileSync(join(app.root, app.editedFile), withDelay(source, options.injectDelayMs));
      const savedAt = performance.now();
      await waitForBody(url, `f0 ${revision}`, options.saveDeadlineMs, output);
      samplesMs.push(performance.now() - savedAt);
    }
    return { ...summarize(samplesMs), firstStartMs };
  } finally {
    await stopGroup(child);
    writeFileSync(join(app.root, app.editedFile), functionSource(0, "v0"));
  }
}

/**
 * Computes median, nearest-rank p95 and maximum.
 * @param samplesMs - Latencies in save order.
 * @returns Distribution including the raw samples.
 */
export function summarize(samplesMs: readonly number[]): Omit<ReloadMeasurement, "firstStartMs"> {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return {
    samplesMs,
    medianMs,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    maximumMs: sorted.at(-1) ?? 0,
  };
}

/**
 * Adds a blocking top-level delay to a handler module, simulating a slow reload.
 * @param source - Handler module source.
 * @param delayMs - Delay; zero leaves the source unchanged.
 * @returns Module source.
 */
function withDelay(source: string, delayMs: number): string {
  return delayMs <= 0 ? source : `${source}Bun.sleepSync(${delayMs});\n`;
}

/**
 * Polls a URL until its body contains the expected text.
 * @param url - Route URL.
 * @param expected - Text the body must contain.
 * @param deadlineMs - Milliseconds before giving up.
 * @param output - Accumulated dev output, quoted in the failure.
 */
async function waitForBody(
  url: string,
  expected: string,
  deadlineMs: number,
  output: () => string,
): Promise<void> {
  const deadline = performance.now() + deadlineMs;
  while (performance.now() < deadline) {
    const body = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      .then((response) => (response.ok ? response.text() : ""))
      .catch(() => "");
    if (body.includes(expected)) return;
    await Bun.sleep(5);
  }
  throw new Error(
    `${url} did not serve "${expected}" within ${deadlineMs} ms.\n${output().slice(-4_000)}`,
  );
}

/**
 * Collects a child's stdout and stderr for failure messages.
 * @param child - Spawned dev process.
 * @returns Reader of the text collected so far.
 */
function collect(child: Bun.Subprocess<"ignore", "pipe", "pipe">): () => string {
  let text = "";
  const decoder = new TextDecoder();
  for (const stream of [child.stdout, child.stderr])
    void (async () => {
      for await (const chunk of stream) text = `${text}${decoder.decode(chunk)}`.slice(-16_384);
    })().catch(() => undefined);
  return () => text;
}

/**
 * Terminates the dev process group and waits for the leader to exit.
 * @param child - Spawned detached dev process.
 */
async function stopGroup(child: Bun.Subprocess): Promise<void> {
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      // The group has already exited.
    }
  };
  signal("SIGTERM");
  const exited = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(10_000).then(() => false),
  ]);
  if (!exited) signal("SIGKILL");
  await child.exited;
}

/**
 * Reserves an ephemeral port and releases it for the dev server.
 * @returns A port that was free a moment ago.
 */
async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("No ephemeral port was assigned.");
  return port;
}
