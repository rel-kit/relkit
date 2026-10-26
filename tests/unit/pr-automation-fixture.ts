/** Owns disposable Git repositories for exercising PR-data reads and dependency normalization without touching the user's checkout. */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Provides a real Git object database with deterministic local commits and guaranteed cleanup.
 * @param files - Initial tracked UTF-8 fixture files.
 * @param run - Scenario that owns all mutations inside the disposable repository.
 * @returns Completion after the fixture has been removed, including on failure.
 */
export async function withAutomationRepository(
  files: Readonly<Record<string, string>>,
  run: (fixture: {
    readonly root: string;
    readonly base: string;
    readonly git: (...args: string[]) => string;
    readonly write: (path: string, content: string) => Promise<void>;
    readonly commit: () => string;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-pr-data-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  const commit = () => {
    git("add", "--all");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "--quiet", "-b", "main");
    for (const [path, content] of Object.entries(files)) await write(path, content);
    const base = commit();
    await run({ root, base, git, write, commit });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
