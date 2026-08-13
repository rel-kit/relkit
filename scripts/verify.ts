import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const bun = process.execPath;

type Placeholder = readonly [label: string, command: string, owner: string];

const placeholders: Placeholder[] = [
  ["full source lint", "bun run lint", "Phase 2 / Gate 2, task 3.16"],
  ["type fixtures", "bun run test:types", "Phase 2 / Gate 2, task 3.4"],
  ["unit and schema tests", "bun run test:unit", "Phase 1 / Gate 1, tasks 2.4 and 2.7"],
  ["compiler and graph tests", "bun run test:compiler", "Phase 3 / Gate 3, task 4.19"],
  ["provider contracts", "bun run test:contracts", "Phase 7 / Gate 7, task 8.14"],
  ["integration tests", "bun run test:integration", "Phase 5 / Gate 5, task 6.13"],
  ["restart tests", "bun run test:restart", "Phases 8–9 / Gates 8–9, tasks 9.15 and 10.15"],
  ["inspector API tests", "bun run test:inspector", "Phase 12 / Gate 12, task 13.15"],
  ["packed generator smoke", "bun run test:generator", "Phase 14 / Gate 14, task 15.17"],
  ["build", "bun run build", "Phase 15 / Gate 15, task 16.5"],
  ["security and redaction tests", "bun run test:security", "Phase 11 / Gate 11, task 12.15"],
];

async function run(label: string, executable: string, args: string[]): Promise<void> {
  console.log(`\n▶ ${label}: ${[executable, ...args].join(" ")}`);
  const child = Bun.spawn([executable, ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
  console.log(`✓ ${label}`);
}

function lineCount(text: string): number {
  const lines = text.split(/\r?\n/);
  return text.endsWith("\n") || text.endsWith("\r") ? lines.length - 1 : lines.length;
}

export function implementationSizeOffenders(root: string): string[] {
  const offenders: string[] = [];
  for (const directory of ["apps", "packages", "scripts", "templates"]) {
    const absolute = resolve(root, directory);
    if (!existsSync(absolute)) continue;
    for (const path of new Bun.Glob("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}").scanSync({
      cwd: absolute,
      onlyFiles: true,
    })) {
      if (/(^|\/)(dist|node_modules|\.turbo|\.zsys)(\/|$)/.test(path)) continue;
      const file = resolve(absolute, path);
      const lines = lineCount(readFileSync(file, "utf8"));
      if (lines > 200) offenders.push(`${relative(root, file)} (${lines} lines)`);
    }
  }
  return offenders.sort();
}

function checkImplementationSize(): void {
  const offenders = implementationSizeOffenders(root);
  if (offenders.length > 0)
    throw new Error(`Implementation files exceed 200 lines:\n${offenders.join("\n")}`);
  console.log(`✓ implementation-file limit (maximum 200 lines)`);
}

async function runStructuralAudit(): Promise<void> {
  console.log("\n▶ configured structural audit: bun run konsistent -- check --format=json");
  const child = Bun.spawn(
    [bun, "run", "konsistent", "--", "check", "--format=json", "--max-diagnostics=1000"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (exitCode > 1)
    throw new Error(`configured structural audit failed with exit code ${exitCode}`);
  if (exitCode === 1) {
    console.log("⚠ structural findings are advisory; configuration validation remains blocking");
  } else {
    console.log("✓ configured structural audit");
  }
}

async function main(): Promise<void> {
  await run("frozen install check", bun, ["install", "--frozen-lockfile"]);
  await run("format check", bun, [
    "x",
    "prettier",
    "--check",
    "AGENTS.md",
    "package.json",
    "turbo.json",
    "tsconfig.base.json",
    "tsconfig.json",
    ".prettierrc.json",
    "eslint.config.mjs",
    "apps",
    "packages",
    "scripts",
    "templates",
    "tests",
  ]);
  await run("ESLint configuration check", bun, ["x", "eslint", "eslint.config.mjs"]);
  await run("dependency and scope checks", bun, ["run", "scripts/check-boundaries.ts"]);
  checkImplementationSize();
  await run("Konsistent configuration validation", bun, ["run", "konsistent", "--", "validate"]);
  await runStructuralAudit();
  await run("typecheck", bun, ["run", "typecheck"]);
  await run("public declaration emission and leak scan", bun, [
    "run",
    "scripts/check-public-declarations.ts",
  ]);
  await run("Phase 0 guardrail tests", bun, ["test", "tests/phase0.test.ts"]);

  for (const [label, command, owner] of placeholders) {
    console.log(`○ NOT RUN — ${label}: ${command} (placeholder; owner: ${owner})`);
  }
  await run("whitespace check", "git", ["diff", "--check"]);
  console.log(
    `\nPhase 0 verification checks passed; ${placeholders.length} later suites remain NOT RUN placeholders.`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
