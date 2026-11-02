/**
 * Measures packed creation for one template and merges per-template results into the capability
 * table CI publishes. A template that fails or is not measured is listed as untested; only a failed
 * default minimal template fails the merge, because it blocks the release.
 *
 * Results live in the ignored `test-results/creation-capability` directory; the merged table is
 * written there as `capability-table.json` and printed as Markdown for the CI job summary.
 *
 *   bun scripts/create-capability-table.ts measure --template api
 *   bun scripts/create-capability-table.ts merge
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CREATE_TEMPLATES,
  type CreateCapabilityEvidence,
  type CreateTemplate,
} from "create-relkit";
import { templateDigest, validateCreationReport } from "./release-create-evidence.js";

/** One template's measurement outcome, written next to its reports. */
export type TemplateResult =
  | {
      readonly template: CreateTemplate;
      readonly status: "tested";
      readonly entry: CreateCapabilityEvidence;
    }
  | { readonly template: CreateTemplate; readonly status: "untested"; readonly reason: string };

/** Capability table published as a CI output. */
export interface CapabilityTable {
  readonly version: 1;
  readonly runtime: { readonly name: "bun"; readonly version: string };
  readonly entries: readonly CreateCapabilityEvidence[];
  readonly untested: readonly { readonly template: CreateTemplate; readonly reason: string }[];
}

const root = resolve(import.meta.dir, "..");

/**
 * Runs fresh and restart readiness for one template and records the outcome.
 * @param template - Public template to measure.
 * @param output - Directory receiving `<template>/fresh.json`, `restart.json` and `result.json`.
 * @returns The recorded outcome.
 */
export async function measureTemplate(
  template: CreateTemplate,
  output: string,
): Promise<TemplateResult> {
  const { currentCreateCapabilityIdentity } = await import("create-relkit");
  const identity = currentCreateCapabilityIdentity(template);
  const directory = join(output, template);
  await mkdir(directory, { recursive: true });
  const entry: CreateCapabilityEvidence = {
    template,
    cloud: "none",
    deploy: "none",
    ...(template === "tasks" ? { jobs: "inngest-docker" as const } : {}),
    examples: true,
    identity,
    templateDigest: await templateDigest(join(root, "templates/default/v1", template)),
    freshEvidence: `${template}/fresh.json`,
    restartEvidence: `${template}/restart.json`,
  };
  let result: TemplateResult;
  try {
    for (const set of ["fresh", "restart"] as const) {
      const report = join(directory, `${set}.json`);
      await run([
        "scripts/benchmark-packed-dev.ts",
        "--template",
        template,
        "--set",
        set,
        "--runs",
        "20",
        "--cleanup",
        "--readiness-only",
        "--output",
        report,
      ]);
      validateCreationReport(JSON.parse(await readFile(report, "utf8")), entry, set);
    }
    result = { template, status: "tested", entry };
  } catch (error) {
    result = {
      template,
      status: "untested",
      reason: error instanceof Error ? error.message.split("\n", 1)[0]! : String(error),
    };
  }
  await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

/**
 * Combines per-template results; templates without a result are listed as not measured.
 * @param results - Outcomes read from the measurement jobs.
 * @param bun - Runtime version the measurements ran on.
 * @returns The capability table.
 */
export function mergeResults(results: readonly TemplateResult[], bun: string): CapabilityTable {
  const byTemplate = new Map(results.map((result) => [result.template, result]));
  return {
    version: 1,
    runtime: { name: "bun", version: bun },
    entries: CREATE_TEMPLATES.flatMap((template) => {
      const result = byTemplate.get(template);
      return result?.status === "tested" ? [result.entry] : [];
    }),
    untested: CREATE_TEMPLATES.flatMap((template) => {
      const result = byTemplate.get(template);
      if (result === undefined) return [{ template, reason: "not measured" }];
      return result.status === "untested" ? [{ template, reason: result.reason }] : [];
    }),
  };
}

/**
 * Formats the table as Markdown for the CI job summary.
 * @param table - Merged capability table.
 * @returns One row per template.
 */
export function formatTable(table: CapabilityTable): string {
  const rows = CREATE_TEMPLATES.map((template) => {
    const untested = table.untested.find((item) => item.template === template);
    return `| ${template} | ${untested === undefined ? "tested" : `untested: ${untested.reason}`} |`;
  });
  return [
    `### Creation capability on Bun ${table.runtime.version}`,
    "",
    "| Template | Result |",
    "| --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function run(args: readonly string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`bun ${args.join(" ")} failed (${code})`);
}

async function readResults(input: string): Promise<TemplateResult[]> {
  const results: TemplateResult[] = [];
  for (const entry of await readdir(input, { withFileTypes: true, recursive: true }))
    if (entry.isFile() && entry.name === "result.json")
      results.push(JSON.parse(await readFile(join(entry.parentPath, entry.name), "utf8")));
  return results;
}

/** Directory shared by measurement and merge; never taken from the command line or environment. */
const resultsDirectory = join(root, "test-results", "creation-capability");

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "measure") {
    const requested = option("--template");
    const template = CREATE_TEMPLATES.find((value) => value === requested);
    if (template === undefined)
      throw new Error(`--template must be one of: ${CREATE_TEMPLATES.join("|")}`);
    const result = await measureTemplate(template, resultsDirectory);
    console.log(`${template}: ${result.status === "tested" ? "tested" : result.reason}`);
    return;
  }
  if (mode === "merge") {
    const table = mergeResults(await readResults(resultsDirectory), Bun.version);
    await writeFile(
      join(resultsDirectory, "capability-table.json"),
      JSON.stringify(table, null, 2) + "\n",
    );
    console.log(formatTable(table));
    if (table.untested.some((item) => item.template === "minimal"))
      throw new Error("The default minimal template is untested; the release is blocked.");
    return;
  }
  throw new Error("Usage: create-capability-table.ts measure|merge [options]");
}

if (import.meta.main) await main();
