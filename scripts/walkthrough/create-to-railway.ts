/**
 * Newcomer walkthrough: create the `api` project and deploy it to Railway. It reuses the Railway
 * newcomer test (`scripts/railway-newcomer.ts`) and reports the time until the deployed app answers
 * over HTTPS, counted from the start of creation. Packing the candidate is not part of the time.
 *
 * With Railway credentials (`RAILWAY_API_TOKEN`, or a signed-in `railway` CLI) it deploys a
 * throwaway `relkit-test-*` project and deletes it afterwards. Without them it runs the stubbed
 * flow (`tests/deployment/railway-newcomer.test.ts`) and records "no live timing", which the
 * metrics report shows as "no data".
 *
 *   bun scripts/walkthrough/create-to-railway.ts [--output <file>] [--stub]
 *     [--artifacts <packed release directory>] [--workspace <Railway workspace>]
 */
import { resolve } from "node:path";
import { option, packedCandidate, writeWalkthroughResult } from "./support.js";

const root = resolve(import.meta.dir, "../..");

/** What `scripts/railway-newcomer.ts` prints when it passes. */
interface NewcomerOutcome {
  readonly result: string;
  readonly runtime: string;
  readonly prepared: number;
  readonly timings: Readonly<Record<string, number>>;
}

/**
 * Runs a command, copying its output to this process and keeping what it printed.
 * @param command - Executable and arguments.
 * @param env - Extra environment.
 * @returns Exit code and standard output.
 */
async function capture(
  command: readonly string[],
  env: Record<string, string> = {},
): Promise<{ readonly code: number; readonly output: string }> {
  const child = Bun.spawn([...command], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  let output = "";
  const decoder = new TextDecoder();
  const copy = async (stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) => {
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      output += text;
      sink.write(text);
    }
  };
  await Promise.all([copy(child.stdout, process.stdout), copy(child.stderr, process.stderr)]);
  return { code: await child.exited, output };
}

/** @returns Whether the Railway CLI can act for this user: a token in the environment or a signed-in CLI. */
async function railwayAvailable(): Promise<boolean> {
  if ((process.env.RAILWAY_API_TOKEN ?? "") !== "") return true;
  const child = Bun.spawn(["railway", "whoami"], { stdout: "ignore", stderr: "ignore" });
  return (await child.exited.catch(() => 1)) === 0;
}

/**
 * Finds the outcome line the newcomer test prints.
 * @param output - Everything the test printed.
 * @returns The parsed outcome, if the test printed one.
 */
export function newcomerOutcome(output: string): NewcomerOutcome | undefined {
  const line = output
    .split("\n")
    .reverse()
    .find((text) => text.startsWith('{"result"'));
  return line === undefined ? undefined : (JSON.parse(line) as NewcomerOutcome);
}

/**
 * Picks the reason a newcomer test failed out of its output.
 * @param output - Everything the test printed.
 * @returns The first `RELKIT_*` error code with its message if there is one, else the last
 * meaningful line before the runtime banner.
 */
export function failureReason(output: string): string {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("at ") && !/^Bun v\d/u.test(line));
  const coded = lines.find((line) => /error RELKIT_[A-Z_]+/u.test(line));
  return (coded ?? lines.at(-1) ?? "no output was printed").slice(0, 300);
}

async function main(): Promise<void> {
  const output = option("output");
  if (process.argv.includes("--stub") || !(await railwayAvailable())) {
    const reason = process.argv.includes("--stub")
      ? "--stub was given"
      : "the Railway CLI is not signed in and RAILWAY_API_TOKEN is not set";
    const stub = await capture(["bun", "test", "tests/deployment/railway-newcomer.test.ts"]);
    const result = await writeWalkthroughResult(output, {
      kind: "create-to-railway",
      outcome: stub.code === 0 ? "stubbed" : "failed",
      seconds: null,
      steps: [],
      note: `No live deploy: ${reason}. The stubbed flow ${stub.code === 0 ? "passed" : "failed"}.`,
    });
    console.log(JSON.stringify(result));
    process.exitCode = stub.code === 0 ? 0 : 1;
    return;
  }
  const candidate = await packedCandidate(root, option("artifacts"));
  console.log(`Candidate packed in ${candidate.packSeconds} s (not part of the walkthrough time)`);
  const workspace = option("workspace") ?? process.env.RAILWAY_WORKSPACE;
  const live = await capture(
    [
      "bun",
      "scripts/railway-newcomer.ts",
      "--artifacts",
      candidate.directory,
      ...(workspace === undefined ? [] : ["--workspace", workspace]),
    ],
    { RELKIT_TEST_RAILWAY: "1" },
  );
  const outcome = newcomerOutcome(live.output);
  const reachable = outcome?.timings.reachable;
  const passed = live.code === 0 && outcome !== undefined && reachable !== undefined;
  const result = await writeWalkthroughResult(output, {
    kind: "create-to-railway",
    outcome: passed ? "passed" : "failed",
    seconds: passed ? outcome.prepared + reachable : null,
    steps: passed
      ? [
          { name: "create", seconds: outcome.prepared },
          { name: "deployed", seconds: outcome.prepared + (outcome.timings.deployed ?? 0) },
          { name: "reachable", seconds: outcome.prepared + reachable },
        ]
      : [],
    note: passed
      ? `Railway newcomer test (${outcome.runtime} image): creation and install ${outcome.prepared} s, then deploy until the app answers over HTTPS; packing the candidate (${candidate.packSeconds} s) is excluded.`
      : `The Railway newcomer test failed (exit ${live.code}): ${failureReason(live.output)}`,
  });
  console.log(JSON.stringify(result));
  process.exitCode = passed ? 0 : 1;
}

if (import.meta.main) await main();
