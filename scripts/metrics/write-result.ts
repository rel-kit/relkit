/**
 * Writes the small result files CI jobs hand to the metrics report, so each job states its outcome
 * in a file instead of leaving it to the job log.
 *
 *   bun scripts/metrics/write-result.ts creation-canary --template api --outcome success
 *     --bun 1.3.10 --source published --output <file>
 *   bun scripts/metrics/write-result.ts runtime-http --runtime node --version v22.12.0
 *     --outcome success --output <file>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CreationCanaryResult, RuntimeHttpResult } from "./types.js";

/**
 * Reads one required `--name value` option.
 * @param args - Command-line arguments.
 * @param name - Option name without dashes.
 * @returns The value.
 */
function required(args: readonly string[], name: string): string {
  const index = args.indexOf(`--${name}`);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

/**
 * Reads the outcome of a GitHub Actions job status.
 * @param value - `success` or `failure`; other job statuses count as failures.
 * @returns A recorded outcome.
 */
function outcomeOf(value: string): "success" | "failure" {
  return value === "success" ? "success" : "failure";
}

/**
 * Builds the result record for a command line.
 * @param args - Arguments after the script name.
 * @param createdAt - Record time.
 * @returns The record to write.
 */
export function resultFor(
  args: readonly string[],
  createdAt: string,
): CreationCanaryResult | RuntimeHttpResult {
  const [kind] = args;
  if (kind === "creation-canary") {
    const source = required(args, "source");
    if (source !== "published" && source !== "candidate")
      throw new Error("--source must be published or candidate");
    return {
      protocol: "relkit.creation-canary-result",
      template: required(args, "template"),
      outcome: outcomeOf(required(args, "outcome")),
      bun: required(args, "bun"),
      source,
      createdAt,
    };
  }
  if (kind === "runtime-http") {
    const runtime = required(args, "runtime");
    if (runtime !== "bun" && runtime !== "node") throw new Error("--runtime must be bun or node");
    return {
      protocol: "relkit.runtime-http-result",
      runtime,
      version: required(args, "version"),
      outcome: outcomeOf(required(args, "outcome")),
      createdAt,
    };
  }
  throw new Error("The first argument must be creation-canary or runtime-http");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const output = resolve(required(args, "output"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(resultFor(args, new Date().toISOString()), undefined, 2)}\n`,
  );
}
