/**
 * Keeps generated material and machine-specific paths out of the repository:
 *
 * - `report-artifact`: bug-fix reports belong in GitHub issues, not under `bug-fix-reports/` or
 *   `bug-fix-ui-reports/`.
 * - `raw-evidence`: `docs/evidence` holds Markdown summaries; full reports are CI artifacts and
 *   release assets (see `scripts/release-evidence.ts`).
 * - `docs-size`: `docs/` stays under {@link DOCS_LIMIT_BYTES}.
 * - `personal-path`: no paths under a personal home directory or a machine temporary directory.
 *   CI runner homes (`/home/runner`, `/Users/runner`) and plain `/tmp/<name>` fixture paths are the
 *   same on every machine and are allowed. Files that must quote such a path go on
 *   {@link PATH_ALLOWLIST} with the reason.
 */
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** One rule violation; `line` is set for content rules. */
export interface HygieneFinding {
  readonly rule: "report-artifact" | "raw-evidence" | "docs-size" | "personal-path";
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

/** `docs/` must stay strictly below this size. */
export const DOCS_LIMIT_BYTES = 5 * 1024 * 1024;

/** Files allowed to contain machine-specific paths, each with the reason. */
export const PATH_ALLOWLIST: Readonly<Record<string, string>> = {
  "scripts/repository-hygiene.ts": "Defines the patterns.",
  "tests/unit/repository-hygiene.test.ts": "Fixtures that must fail the check.",
};

const REPORT_ROOTS = ["bug-fix-reports/", "bug-fix-ui-reports/"];

/** Personal homes (except CI runners), macOS temporary directories and Windows profiles. */
export const PERSONAL_PATH =
  /(?<![\w.@~-])(?:\/Users\/(?!runner\/|Shared\/)[A-Za-z0-9._-]+\/|\/home\/(?!runner\/)[a-z0-9._-]+\/|\/private\/tmp\/|(?:\/private)?\/var\/folders\/|[A-Za-z]:\\{1,2}Users\\{1,2}[^\\\s]+\\)/u;

/**
 * Lists the files Git tracks or would add, without ignored files.
 * @param root - Repository root.
 * @returns Repository-relative paths that exist on disk.
 */
export function repositoryFiles(root: string): string[] {
  const listed = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard"], { cwd: root });
  if (listed.exitCode !== 0) throw new Error(listed.stderr.toString());
  return listed.stdout
    .toString()
    .split("\n")
    .filter((path) => path !== "" && statSync(join(root, path), { throwIfNoEntry: false }));
}

/**
 * Checks file locations and the size of `docs/`.
 * @param root - Repository root.
 * @param files - Repository-relative paths to check.
 * @returns Findings in path order.
 */
export function layoutFindings(root: string, files: readonly string[]): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  let docsBytes = 0;
  for (const file of files) {
    if (REPORT_ROOTS.some((prefix) => file.startsWith(prefix)))
      findings.push({
        rule: "report-artifact",
        file,
        message: "Bug-fix reports are not committed; link the GitHub issue instead.",
      });
    if (file.startsWith("docs/evidence/") && !file.endsWith(".md"))
      findings.push({
        rule: "raw-evidence",
        file,
        message:
          "Full reports are CI artifacts and release assets; commit a Markdown summary under docs/evidence instead.",
      });
    if (file.startsWith("docs/")) docsBytes += statSync(join(root, file)).size;
  }
  if (docsBytes >= DOCS_LIMIT_BYTES)
    findings.push({
      rule: "docs-size",
      file: "docs/",
      message: `docs/ is ${(docsBytes / 1024 / 1024).toFixed(1)} MB; keep it under ${DOCS_LIMIT_BYTES / 1024 / 1024} MB.`,
    });
  return findings;
}

/**
 * Finds machine-specific paths in one file's text.
 * @param file - Repository-relative path, used for the allowlist and messages.
 * @param text - File contents.
 * @returns One finding per offending line.
 */
export function pathFindings(file: string, text: string): HygieneFinding[] {
  if (file in PATH_ALLOWLIST || text.includes("\0")) return [];
  return text.split("\n").flatMap((line, index) => {
    const match = PERSONAL_PATH.exec(line);
    return match === null
      ? []
      : [
          {
            rule: "personal-path" as const,
            file,
            line: index + 1,
            message: `Machine-specific path "${match[0]}"; use a repository-relative path or a placeholder.`,
          },
        ];
  });
}

/**
 * Runs every rule over the repository.
 * @param root - Repository root.
 * @param files - Paths to check; defaults to the tracked and addable files.
 * @returns All findings.
 */
export function checkRepository(
  root: string,
  files: readonly string[] = repositoryFiles(root),
): HygieneFinding[] {
  const findings = layoutFindings(root, files);
  for (const file of files) {
    const path = join(root, file);
    if (statSync(path).size > 32 * 1024 * 1024) continue;
    findings.push(...pathFindings(file, readFileSync(path, "latin1")));
  }
  return findings;
}

/**
 * Formats a finding as `file:line [rule] message`.
 * @param finding - Finding to print.
 * @returns One line.
 */
export function formatHygieneFinding(finding: HygieneFinding): string {
  const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return `${location} [${finding.rule}] ${finding.message}`;
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const findings = checkRepository(root);
  for (const finding of findings) console.error(formatHygieneFinding(finding));
  if (findings.length > 0) {
    console.error(`Repository hygiene check failed with ${findings.length} finding(s).`);
    process.exitCode = 1;
  } else console.log("Repository hygiene check passed.");
}
