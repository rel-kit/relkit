/**
 * Builds the plan metrics report from CI outputs and writes `metrics.json`. The metrics page and
 * the launch checklist read that file. A metric whose output is missing shows "no data".
 *
 *   bun scripts/metrics.ts --inputs <directory of downloaded artifacts> [--output <directory>]
 *     [--summary]
 *
 * `--output` defaults to `test-results/metrics`; `--summary` prints the Markdown table instead of
 * the one-line JSON result, for a CI job summary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { countPackages, evaluateMetrics } from "./metrics/evaluate.js";
import { readMetricInputs } from "./metrics/read-inputs.js";
import { metricsMarkdown } from "./metrics/render.js";
import type { MetricsReport } from "./metrics/types.js";

const root = resolve(import.meta.dir, "..");

/**
 * Reads one `--name value` option.
 * @param name - Option name without dashes.
 * @returns The value, or undefined when absent.
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

/**
 * Builds the report.
 * @param inputs - Directory of downloaded CI outputs; a missing directory means no data.
 * @param createdAt - Report time.
 * @param commit - Commit measured, when known.
 * @returns The metrics report.
 */
export function buildMetricsReport(
  inputs: string,
  createdAt: string,
  commit: string | undefined,
): MetricsReport {
  return {
    protocol: "relkit.metrics",
    version: 1,
    createdAt,
    commit,
    metrics: evaluateMetrics(readMetricInputs(inputs), countPackages(root)),
  };
}

async function main(): Promise<void> {
  const inputs = option("inputs");
  if (inputs === undefined) throw new Error("--inputs <directory> is required");
  const output = resolve(option("output") ?? join(root, "test-results/metrics"));
  const report = buildMetricsReport(
    resolve(inputs),
    new Date().toISOString(),
    process.env.GITHUB_SHA,
  );
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "metrics.json"), `${JSON.stringify(report, undefined, 2)}\n`);
  if (process.argv.includes("--summary")) console.log(metricsMarkdown(report));
  else
    console.log(
      JSON.stringify({
        protocol: "relkit.metrics-written",
        output: join(output, "metrics.json"),
        metrics: report.metrics.length,
        noData: report.metrics.filter((metric) => metric.status === "no-data").length,
      }),
    );
}

if (import.meta.main) await main();
