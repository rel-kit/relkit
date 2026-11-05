/**
 * Rejects runtime-specific code outside runtime adapters in framework package sources.
 * `Bun.*` and `bun` imports are checked in every package; `node:` imports are checked in the
 * packages that run inside applications (tooling that only runs on Bun and Node may use them).
 * Call sites that predate the check are listed per file in `portability-baseline.json`; a file's
 * count may only shrink, and `--update-baseline` lowers the recorded counts to the current ones.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";
import {
  isRuntimeAdapter,
  portabilityUses,
  type PortabilityKind,
  type PortabilityUse,
} from "./portability-scan.js";

/** Recorded call-site counts of one file. */
export type PortabilityBaseline = Readonly<
  Record<string, Partial<Record<PortabilityKind, number>>>
>;

/**
 * Packages that only run as tools on Bun or Node, where `node:` imports are portable. The Docker
 * integration runs local services for the CLI and never inside an application server.
 */
export const TOOLING_PACKAGES: ReadonlySet<string> = new Set([
  "integrations/packages/docker",
  "packages/cli",
  "packages/create-relkit",
  "packages/inspector",
  "packages/testing",
]);

/**
 * Scans package sources for runtime-specific uses outside adapters.
 * @param root - Repository root.
 * @param packages - Repository-relative package directories; defaults to every workspace package.
 * @returns Uses that need an adapter, in path order.
 */
export function scanPortability(root: string, packages?: readonly string[]): PortabilityUse[] {
  const directories =
    packages ?? workspacePackageDirectories(root).map((path) => relative(root, path));
  const uses: PortabilityUse[] = [];
  for (const directory of [...directories].sort()) {
    const tooling = TOOLING_PACKAGES.has(directory);
    for (const file of sourceFiles(join(root, directory, "src"))) {
      const path = relative(root, file).replaceAll("\\", "/");
      if (isRuntimeAdapter(path)) continue;
      for (const use of portabilityUses(path, readFileSync(file, "utf8")))
        if (use.kind === "bun" || !tooling) uses.push(use);
    }
  }
  return uses;
}

/**
 * Compares current uses with the baseline.
 * @param uses - Current uses from {@link scanPortability}.
 * @param baseline - Recorded counts per file and kind.
 * @returns One message per call site in a new or grown file, and per stale baseline entry.
 */
export function portabilityProblems(
  uses: readonly PortabilityUse[],
  baseline: PortabilityBaseline,
): string[] {
  const problems: string[] = [];
  const counts = countUses(uses);
  for (const [file, kinds] of Object.entries(counts))
    for (const [kind, count] of Object.entries(kinds) as [PortabilityKind, number][]) {
      const recorded = baseline[file]?.[kind] ?? 0;
      if (count <= recorded) continue;
      const api = kind === "bun" ? "a Bun API" : "a node: module";
      for (const use of uses.filter((item) => item.file === file && item.kind === kind))
        problems.push(
          `${use.file}:${use.line} uses ${api} outside a runtime adapter: ${use.text}` +
            (recorded === 0 ? "" : ` (baseline allows ${recorded} in this file, found ${count})`),
        );
    }
  for (const [file, kinds] of Object.entries(baseline))
    for (const [kind, recorded] of Object.entries(kinds) as [PortabilityKind, number][])
      if ((counts[file]?.[kind] ?? 0) < recorded)
        problems.push(
          `${file} has fewer ${kind} call sites than recorded; run \`bun run scripts/portability.ts --update-baseline\`.`,
        );
  return problems;
}

/**
 * Lowers baseline counts to the current ones; it never raises a count or adds a file.
 * @param uses - Current uses.
 * @param baseline - Recorded counts.
 * @returns The shrunk baseline with keys in path order.
 */
export function shrinkBaseline(
  uses: readonly PortabilityUse[],
  baseline: PortabilityBaseline,
): PortabilityBaseline {
  const counts = countUses(uses);
  const next: Record<string, Partial<Record<PortabilityKind, number>>> = {};
  for (const file of Object.keys(baseline).sort()) {
    const kinds: Partial<Record<PortabilityKind, number>> = {};
    for (const [kind, recorded] of Object.entries(baseline[file]!) as [PortabilityKind, number][]) {
      const count = Math.min(recorded, counts[file]?.[kind] ?? 0);
      if (count > 0) kinds[kind] = count;
    }
    if (Object.keys(kinds).length > 0) next[file] = kinds;
  }
  return next;
}

/**
 * Counts uses per file and kind.
 * @param uses - Call sites.
 * @returns Counts keyed by file.
 */
function countUses(uses: readonly PortabilityUse[]) {
  const counts: Record<string, Partial<Record<PortabilityKind, number>>> = {};
  for (const use of uses) {
    const kinds = (counts[use.file] ??= {});
    kinds[use.kind] = (kinds[use.kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Lists TypeScript sources below a directory, skipping tests and declarations.
 * @param directory - Directory to walk.
 * @returns Absolute file paths.
 */
function sourceFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory())
      return entry === "node_modules" || entry === "dist" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(entry) && !/\.(test|d)\.tsx?$/u.test(entry) ? [path] : [];
  });
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const baselinePath = join(root, "scripts/portability-baseline.json");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as PortabilityBaseline;
  const uses = scanPortability(root);
  if (process.argv.includes("--update-baseline")) {
    writeFileSync(baselinePath, `${JSON.stringify(shrinkBaseline(uses, baseline), null, 2)}\n`);
    console.log("Portability baseline lowered to the current call sites.");
  } else {
    const problems = portabilityProblems(uses, baseline);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) {
      console.error(
        `Portability check failed with ${problems.length} problem(s). Move runtime-specific code into a runtime adapter (relkit/runtime/bun or relkit/runtime/node).`,
      );
      process.exitCode = 1;
    } else console.log(`Portability check passed (${uses.length} baselined call sites).`);
  }
}
