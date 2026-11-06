/**
 * Reads the CI outputs the metrics are built from. An inputs directory is whatever the jobs'
 * artifacts were downloaded into: every `*.json` below it is classified by its `protocol` field,
 * or by its keys for the agent evaluation summary, and anything else is ignored. A missing
 * directory, an unreadable file or an unknown shape is "no data", never a failure.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentEvalSummaryFile,
  ContributionsResult,
  CreationCanaryResult,
  DevLoopReportFile,
  MetricInputs,
  RuntimeHttpResult,
  WalkthroughResult,
} from "./types.js";

/**
 * Lists every JSON file below a directory.
 * @param directory - Directory to walk.
 * @returns Absolute file paths in a stable order; empty when the directory is missing.
 */
function jsonFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/**
 * Parses a JSON object, tolerating anything unreadable.
 * @param file - File path.
 * @returns The parsed object, or undefined when the file is not a JSON object.
 */
function readObject(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the most recent record for each key.
 * @param records - Records carrying a creation time.
 * @param key - Identity of the thing measured.
 * @returns The latest record per key.
 */
function latest<T extends { readonly createdAt: string }>(
  records: readonly T[],
  key: (record: T) => string,
): T[] {
  const byKey = new Map<string, T>();
  for (const record of records) {
    const current = byKey.get(key(record));
    if (current === undefined || record.createdAt >= current.createdAt)
      byKey.set(key(record), record);
  }
  return [...byKey.values()];
}

/**
 * Reads and classifies every input below a directory.
 * @param directory - Directory the artifacts were downloaded into.
 * @returns Inputs found; each absent kind is empty or undefined.
 */
export function readMetricInputs(directory: string): MetricInputs {
  const canary: CreationCanaryResult[] = [];
  const runtimes: RuntimeHttpResult[] = [];
  const walkthroughs: WalkthroughResult[] = [];
  let devLoop: DevLoopReportFile | undefined;
  let agentEvals: AgentEvalSummaryFile | undefined;
  let contributions: ContributionsResult | undefined;
  for (const file of jsonFiles(directory)) {
    const record = readObject(file);
    if (record === undefined) continue;
    switch (record.protocol) {
      case "relkit.creation-canary-result":
        canary.push(record as unknown as CreationCanaryResult);
        break;
      case "relkit.runtime-http-result":
        runtimes.push(record as unknown as RuntimeHttpResult);
        break;
      case "relkit.walkthrough-result":
        walkthroughs.push(record as unknown as WalkthroughResult);
        break;
      case "relkit.dev-loop-benchmark":
        devLoop = record as unknown as DevLoopReportFile;
        break;
      case "relkit.contributions":
        contributions = record as unknown as ContributionsResult;
        break;
      default:
        if (typeof record.passRate === "number" && typeof record.runs === "number")
          agentEvals = record as unknown as AgentEvalSummaryFile;
    }
  }
  return {
    // A published creator run outranks the candidate run of the same template.
    canary: latest(canary, (item) => `${item.source}:${item.template}`),
    runtimes: latest(runtimes, (item) => `${item.runtime}:${item.version}`),
    walkthroughs: latest(walkthroughs, (item) => `${item.kind}:${item.outcome}`),
    devLoop,
    agentEvals,
    contributions,
  };
}
