import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const bun = process.execPath;

type GitState = { readonly status: string; readonly diff: string };

async function capture(executable: string, args: string[]): Promise<string> {
  const child = Bun.spawn([executable, ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0)
    throw new Error(`${executable} ${args.join(" ")} failed with exit code ${exitCode}: ${stderr}`);
  return stdout;
}

async function gitState(): Promise<GitState> {
  const [status, diff] = await Promise.all([
    capture("git", ["status", "--short", "--untracked-files=all"]),
    capture("git", ["diff", "--binary", "--no-ext-diff"]),
  ]);
  return { status, diff };
}

function assertNoGitStateChange(label: string, before: GitState, after: GitState): void {
  if (before.status !== after.status || before.diff !== after.diff)
    throw new Error(`${label} changed the tracked or untracked worktree state`);
  console.log(`✓ ${label}`);
}

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
  for (const directory of ["apps", "examples", "packages", "scripts", "templates"]) {
    const absolute = resolve(root, directory);
    if (!existsSync(absolute)) continue;
    for (const path of new Bun.Glob("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}").scanSync({
      cwd: absolute,
      onlyFiles: true,
    })) {
      if (/(^|\/)(dist|node_modules|\.turbo|\.relkit)(\/|$)/.test(path)) continue;
      if (/(^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(path)) continue;
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
  console.log("✓ implementation-file limit (maximum 200 lines)");
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
  console.log(
    exitCode === 1
      ? "⚠ structural findings are advisory; configuration validation remains blocking"
      : "✓ configured structural audit",
  );
}

async function main(): Promise<void> {
  const installState = await gitState();
  await run("frozen install", bun, ["install", "--frozen-lockfile"]);
  assertNoGitStateChange("frozen install no-diff", installState, await gitState());
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
    "playwright.config.ts",
    ".github/workflows/ci.yml",
    "apps",
    "examples",
    "packages",
    "scripts",
    "templates",
    "tests",
  ]);
  await run("lint", bun, ["run", "lint"]);
  await run("ESLint configuration check", bun, ["x", "eslint", "eslint.config.mjs"]);
  await run("boundaries and scope", bun, ["run", "check"]);
  await run("observability sink source scan", bun, ["run", "scripts/check-observability-sinks.ts"]);
  checkImplementationSize();
  await run("Konsistent configuration validation", bun, ["run", "konsistent", "--", "validate"]);
  await runStructuralAudit();
  const buildState = await gitState();
  await run("build", bun, ["run", "build"]);
  assertNoGitStateChange("generated-file no-diff", buildState, await gitState());
  await run("typecheck", bun, ["run", "typecheck"]);
  await run("type fixtures", bun, ["run", "test:types"]);
  await run("unit and schema tests", bun, ["run", "test:unit"]);
  await run("compiler and graph tests", bun, ["run", "test:compiler"]);
  await run("provider contracts", bun, ["run", "test:contracts"]);
  await run("integration tests", bun, ["run", "test:integration"]);
  await run("restart tests", bun, ["run", "test:restart"]);
  await run("inspector API tests", bun, ["run", "test:inspector"]);
  await run("generator tests", bun, ["run", "test:generator"]);
  await run("executable examples", bun, ["run", "test:examples"]);
  await run("documentation", bun, ["run", "test:docs"]);
  await run("packed generator smoke", bun, ["run", "scripts/pack-and-smoke-create-relkit.ts"]);
  await run("recursive synthetic-secret artifact scan", bun, ["run", "scripts/secret-scan.ts"]);
  await run("whitespace check", "git", ["diff", "--check"]);
  await run("security and redaction tests", bun, ["run", "test:security"]);
  await run("public declaration leak scan", bun, ["run", "scripts/check-public-declarations.ts"]);
  await run("agent declaration/source/graph scans", bun, [
    "test",
    "tests/agents/source-boundaries.test.ts",
    "tests/compiler/commerce-example.test.ts",
  ]);
  console.log("\nVerification passed in the fixed fail-fast order.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
