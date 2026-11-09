/**
 * Runs the CONTRIBUTING quickstart in the current checkout, so CI proves that a clean clone gets from
 * install to a passing `prepush` with the documented commands only. The clone line is skipped because
 * CI has already checked out the repository.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The quickstart section may not exceed this many lines, including its code block. */
export const QUICKSTART_LIMIT = 10;

/**
 * Extracts the quickstart commands from CONTRIBUTING.
 * @param markdown - CONTRIBUTING contents.
 * @returns The section's line count and its shell commands without comments or the clone step.
 * @throws When the section or its `sh` block is missing.
 */
export function quickstart(markdown: string): {
  readonly lines: number;
  readonly commands: readonly string[];
} {
  const section = /^## Quickstart\n([\s\S]*?)(?=^## )/mu.exec(markdown)?.[1];
  if (section === undefined) throw new Error("CONTRIBUTING.md has no ## Quickstart section");
  const block = /^```sh\n([\s\S]*?)^```$/mu.exec(section)?.[1];
  if (block === undefined) throw new Error("The quickstart has no ```sh block");
  return {
    lines: section.trim().split("\n").length,
    commands: block
      .split("\n")
      .map((line) => line.replace(/\s+#.*$/u, "").trim())
      .filter((line) => line !== "" && !line.startsWith("git clone")),
  };
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const { lines, commands } = quickstart(readFileSync(join(root, "CONTRIBUTING.md"), "utf8"));
  if (lines > QUICKSTART_LIMIT)
    throw new Error(`The quickstart has ${lines} lines; keep it to ${QUICKSTART_LIMIT}.`);
  for (const command of commands) {
    console.log(`\n▶ ${command}`);
    const child = Bun.spawn(["bash", "-euo", "pipefail", "-c", command], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code !== 0) throw new Error(`Quickstart step failed (${code}): ${command}`);
  }
  console.log(`\nQuickstart passed (${commands.length} commands).`);
}
