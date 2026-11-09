/**
 * Enforces the 250-line limit for implementation files as a ratchet. Files that already exceeded
 * it are listed in `file-size-baseline.json` with their length; they may shrink but not grow, and a
 * file that drops to the limit must leave the baseline. Every other file must stay within the limit.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { implementationSizeOffenders } from "./verify";

/**
 * Compares current oversized files with the baseline.
 * @param offenders - `path (N lines)` entries from {@link implementationSizeOffenders}.
 * @param baseline - Recorded lengths of files allowed to exceed the limit.
 * @returns One message per new, grown or no-longer-oversized file.
 */
export function fileSizeProblems(
  offenders: readonly string[],
  baseline: Readonly<Record<string, number>>,
): string[] {
  const current = new Map(
    offenders.map((entry) => {
      const match = /^(.*) \((\d+) lines\)$/u.exec(entry)!;
      return [match[1]!, Number(match[2])] as const;
    }),
  );
  const problems: string[] = [];
  for (const [file, lines] of current) {
    const recorded = baseline[file];
    if (recorded === undefined)
      problems.push(`${file} has ${lines} lines; split it to 250 or fewer.`);
    else if (lines > recorded)
      problems.push(`${file} grew from ${recorded} to ${lines} lines; it may only shrink.`);
  }
  for (const file of Object.keys(baseline))
    if (!current.has(file))
      problems.push(
        `${file} is within 250 lines now; remove it from scripts/file-size-baseline.json.`,
      );
  return problems;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const baseline = JSON.parse(
    readFileSync(join(root, "scripts/file-size-baseline.json"), "utf8"),
  ) as Record<string, number>;
  const problems = fileSizeProblems(implementationSizeOffenders(root), baseline);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`File size check failed with ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else console.log("File size check passed (250-line limit).");
}
