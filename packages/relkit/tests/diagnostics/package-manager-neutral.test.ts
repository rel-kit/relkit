/**
 * RelKit projects use npm, pnpm or Bun, and the catalogue and the launcher cannot know which. A
 * text that gives a package manager's command gives all three, so it never sends an npm user to
 * `bun install`; only entries that are really about the Bun runtime may name Bun alone.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CODES } from "../../src/diagnostics/codes/index.js";

/** A package manager's command: `bun add`, `npm run`, `pnpm dlx`, `bunx`, `npx`. */
const COMMAND =
  /\b(?:(?:bun|npm|pnpm|yarn)(?: --bun)? (?:install|add|run|x|create|exec|dlx|i)|bunx|npx)\b/;
const MANAGERS = ["bun", "npm", "pnpm"] as const;

/** Entries about the Bun runtime, where naming Bun alone is the right instruction. */
const BUN_RUNTIME_CODES = new Set(["RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED"]);

/** Launcher files whose text is about running a package or the Bun runtime. */
const LAUNCHER_ALLOWED_FILES = new Set([
  // Spells each manager's install command in one table, and picks the project's.
  "package-manager.ts",
  // Runs `bunx`, `pnpm dlx` or `npx` as a child process; prints only "Install Bun >=…".
  "launch-bun.ts",
]);

/**
 * Checks one text.
 * @param text - Catalogue field or source file.
 * @returns Whether it names no package manager command, or names all three managers.
 */
function neutral(text: string): boolean {
  return (
    !COMMAND.test(text) || MANAGERS.every((manager) => new RegExp(`\\b${manager}\\b`).test(text))
  );
}

describe("package manager neutral text", () => {
  it("names no single package manager's command in the catalogue", () => {
    const offenders = DIAGNOSTIC_CODES.filter(
      (entry) => !BUN_RUNTIME_CODES.has(entry.code),
    ).flatMap((entry) =>
      (["title", "happened", "fix"] as const)
        .filter((field) => !neutral(entry[field]))
        .map((field) => `${entry.code}.${field}: ${entry[field]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the Bun-only entries to the Bun runtime", () => {
    for (const code of BUN_RUNTIME_CODES) {
      const entry = DIAGNOSTIC_CODES.find((candidate) => candidate.code === code);
      expect(entry?.happened).toContain("exists only on Bun");
    }
  });

  it("names no single package manager's command in the launcher", () => {
    const directory = join(import.meta.dirname, "../../src/launcher");
    const files = readdirSync(directory).filter(
      (file) => file.endsWith(".ts") && !LAUNCHER_ALLOWED_FILES.has(file),
    );
    expect(files).toContain("index.ts");
    const offenders = files.filter((file) => !neutral(readFileSync(join(directory, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
