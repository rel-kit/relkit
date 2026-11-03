/**
 * Compares `docs/dependencies.md` with `bun.lock`. Every pre-release version a workspace package
 * depends on directly and every patched dependency must have a row in the policy with an owner and
 * an exit plan; rows for versions the lockfile no longer resolves are reported as stale.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** One dependency the policy must list, as `name@version`. */
export interface PolicySubject {
  readonly id: string;
  readonly kind: "pre-release" | "patched";
  readonly users: readonly string[];
}

/** A policy row: the backticked `name@version` and its owner and exit plan cells. */
export interface PolicyRow {
  readonly id: string;
  readonly owner: string;
  readonly exit: string;
}

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

interface Lockfile {
  readonly workspaces: Record<string, Partial<Record<(typeof SECTIONS)[number], object>>>;
  readonly packages: Record<string, readonly [string, ...unknown[]]>;
  readonly patchedDependencies?: Record<string, string>;
}

/**
 * Parses Bun's text lockfile, which allows trailing commas.
 * @param text - `bun.lock` contents.
 * @returns The parsed lockfile.
 */
export function parseLockfile(text: string): Lockfile {
  return JSON.parse(text.replace(/,(\s*[}\]])/gu, "$1")) as Lockfile;
}

/**
 * Lists direct pre-release dependencies and patched dependencies.
 * @param lock - Parsed lockfile.
 * @returns Subjects sorted by id.
 */
export function policySubjects(lock: Lockfile): PolicySubject[] {
  const users = new Map<string, string[]>();
  for (const [workspace, manifest] of Object.entries(lock.workspaces))
    for (const section of SECTIONS)
      for (const name of Object.keys(manifest[section] ?? {}))
        users.set(name, [...(users.get(name) ?? []), workspace || "(root)"]);
  const subjects = new Map<string, PolicySubject>();
  for (const [name, workspaces] of users) {
    const resolved = lock.packages[name]?.[0];
    if (resolved === undefined) continue;
    const version = resolved.slice(resolved.lastIndexOf("@") + 1);
    if (version.startsWith("workspace:") || !version.includes("-")) continue;
    const id = `${name}@${version}`;
    subjects.set(id, { id, kind: "pre-release", users: [...new Set(workspaces)].sort() });
  }
  for (const id of Object.keys(lock.patchedDependencies ?? {}))
    subjects.set(id, { id, kind: "patched", users: subjects.get(id)?.users ?? [] });
  return [...subjects.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Reads table rows whose first cell is a backticked `name@version`.
 * @param markdown - Policy document.
 * @returns Rows with their owner (third cell from the end) and exit plan (last cell).
 */
export function policyRows(markdown: string): PolicyRow[] {
  return markdown.split("\n").flatMap((line) => {
    const match = /^\|\s*`([^`]+@[^`]+)`\s*\|/u.exec(line);
    if (match === null) return [];
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    return [{ id: match[1]!, owner: cells.at(-2) ?? "", exit: cells.at(-1) ?? "" }];
  });
}

/**
 * Compares lockfile subjects with policy rows.
 * @param subjects - Dependencies the policy must list.
 * @param rows - Rows in the policy.
 * @returns One message per missing, incomplete or stale row.
 */
export function policyProblems(
  subjects: readonly PolicySubject[],
  rows: readonly PolicyRow[],
): string[] {
  const listed = new Map(rows.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const subject of subjects) {
    const row = listed.get(subject.id);
    if (row === undefined)
      problems.push(
        `${subject.id} (${subject.kind}, used by ${subject.users.join(", ") || "the workspace"}) is not listed in docs/dependencies.md.`,
      );
    else if (row.owner === "" || row.exit === "")
      problems.push(`${subject.id}: docs/dependencies.md needs an owner and an exit plan.`);
  }
  const ids = new Set(subjects.map((subject) => subject.id));
  for (const row of rows)
    if (!ids.has(row.id))
      problems.push(
        `${row.id} is listed in docs/dependencies.md but bun.lock does not resolve it.`,
      );
  return problems;
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const subjects = policySubjects(parseLockfile(readFileSync(join(root, "bun.lock"), "utf8")));
  const problems = policyProblems(
    subjects,
    policyRows(readFileSync(join(root, "docs/dependencies.md"), "utf8")),
  );
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`Dependency policy check failed with ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else console.log(`Dependency policy check passed (${subjects.length} listed dependencies).`);
}
