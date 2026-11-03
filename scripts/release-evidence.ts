/**
 * Keeps verification evidence out of the repository. Evidence-producing scripts write full reports
 * under the ignored `test-results/evidence` directory, CI uploads that directory as a workflow
 * artifact, and this script bundles the reports with the committed summaries into one release asset.
 * The repository keeps only the short Markdown summary rendered by {@link creationSummary}.
 *
 *   bun scripts/release-evidence.ts bundle --reports <dir> [--reports <dir>] --output <dir>
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve } from "node:path";

/** Directory, relative to the repository root, that receives full reports. */
export const EVIDENCE_REPORTS = "test-results/evidence";

/** Committed directory that holds one creation summary per `create-relkit` release. */
export const CREATION_SUMMARIES = "docs/evidence/create-capabilities";

interface ReadinessReport {
  readonly version: number;
  readonly summary: {
    readonly runs: number;
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly passed: boolean;
  };
  readonly readiness?: { readonly runs: number; readonly passed: boolean };
  readonly environment: {
    readonly bun: string;
    readonly platform: string;
    readonly arch: string;
    readonly cpu?: string;
  };
}

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(2)} s`;

/**
 * Renders the committed summary of one creation certification.
 * @param release - `create-relkit` release the reports measured.
 * @param reports - Parsed fresh and restart readiness reports.
 * @param location - Where the full reports are kept; defaults to the workflow artifact and release asset.
 * @returns Markdown that names where the full reports are.
 */
export function creationSummary(
  release: string,
  reports: { readonly fresh: unknown; readonly restart: unknown },
  location = "the workflow artifact of the run that measured them and in the GitHub release's `evidence-<version>.tar.gz`",
): string {
  const rows = (["fresh", "restart"] as const).map((set) => {
    const report = reports[set] as ReadinessReport;
    const ready = report.readiness?.passed ?? report.summary.passed;
    const target = report.summary.passed ? "met" : "missed";
    return `| ${set} | ${report.summary.runs} | ${ready ? "passed" : "failed"} | ${seconds(report.summary.medianMs)} | ${seconds(report.summary.p95Ms)} | ${target} |`;
  });
  const host = (reports.fresh as ReadinessReport).environment;
  return [
    `# create-relkit ${release} creation evidence`,
    "",
    `Packed \`minimal\` template with examples, \`bun dev\`, Bun ${host.bun} on ${host.platform}-${host.arch}${host.cpu ? ` (${host.cpu})` : ""}.`,
    "",
    "| Set | Runs | Readiness | Median | p95 | One-second target |",
    "| --- | ---- | --------- | ------ | --- | ----------------- |",
    ...rows,
    "",
    `Full reports \`create-capabilities/${release}/fresh.json\` and \`restart.json\` are in ${location}.`,
    "",
  ].join("\n");
}

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  );
  return nested.flat().sort();
}

/**
 * Bundles full reports and the committed summaries into `evidence-<version>.tar.gz`.
 * @param options - Repository root, release batch version, report directories and output directory.
 * @returns The archive path and the number of files it holds.
 * @throws When no report directory holds a file.
 */
export async function bundleEvidence(options: {
  readonly root: string;
  readonly version: string;
  readonly reports: readonly string[];
  readonly output: string;
}): Promise<{ readonly archive: string; readonly files: number }> {
  const name = `evidence-${options.version}`;
  const staging = join(options.output, name);
  await rm(staging, { recursive: true, force: true });
  let count = 0;
  for (const directory of options.reports) {
    for (const path of await files(directory)) {
      const target = join(staging, "reports", basename(directory), relative(directory, path));
      await cp(path, target);
      count += 1;
    }
  }
  if (count === 0) throw new Error(`No evidence reports found in ${options.reports.join(", ")}`);
  await mkdir(join(staging, "summaries"), { recursive: true });
  for (const path of await files(join(options.root, "docs/evidence")))
    await cp(path, join(staging, "summaries", relative(join(options.root, "docs/evidence"), path)));
  const archive = join(options.output, `${name}.tar.gz`);
  const tar = Bun.spawnSync(["tar", "-czf", archive, "-C", options.output, name]);
  if (tar.exitCode !== 0) throw new Error(`tar failed: ${tar.stderr.toString()}`);
  await rm(staging, { recursive: true, force: true });
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
  return { archive, files: count };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "bundle") throw new Error("Usage: release-evidence.ts bundle --reports <dir>");
  const values = (flag: string) =>
    args.flatMap((arg, index) => (arg === flag ? [args[index + 1]!] : []));
  const root = resolve(import.meta.dir, "..");
  const plan = JSON.parse(await readFile(join(root, ".changeset/release.json"), "utf8"));
  const [output] = values("--output");
  if (output === undefined) throw new Error("Pass --output <dir>");
  await mkdir(output, { recursive: true });
  const result = await bundleEvidence({
    root,
    version: plan.version,
    reports: values("--reports").map((path) => resolve(path)),
    output: resolve(output),
  });
  console.log(JSON.stringify({ protocol: "relkit.release-evidence", ...result }));
}

if (import.meta.main) await main();
