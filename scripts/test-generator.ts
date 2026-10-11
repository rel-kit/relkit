import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const testRoot = resolve(root, "tests/generator");
const acceptance = "tests/generator/add-acceptance.test.ts";
const compilationNames =
  "(?:the full bundle|route platform|database and auth|reused Docker profiles)";
const otherFiles = [...new Bun.Glob("**/*.test.ts").scanSync({ cwd: testRoot, onlyFiles: true })]
  .map((file) => `tests/generator/${file}`)
  .filter((file) => file !== acceptance)
  .sort();

const suites = [
  {
    name: "acceptance compilation",
    args: ["--test-name-pattern", `^${compilationNames}`, acceptance],
  },
  {
    name: "acceptance additions",
    args: ["--test-name-pattern", `^(?!${compilationNames})`, acceptance],
  },
  { name: "other generator", args: otherFiles },
] as const;

await runServiceGate("generator strict services", [
  "x",
  "tsc",
  "-p",
  "packages/create-relkit/tsconfig.tests.json",
  "--pretty",
  "false",
]);
await runServiceGate("generator Effect services", [
  "x",
  "--bun",
  "vitest",
  "run",
  "--config",
  "packages/create-relkit/vitest.config.ts",
]);

for (const { name, args } of suites) {
  const startedAt = performance.now();
  const child = Bun.spawn([process.execPath, "test", ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  console.log(`${name}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  if (code !== 0) throw new Error(`${name} failed.`);
}

/**
 * Joins a required generator service gate before the native fixture suites run.
 * @param name - Fixed gate label.
 * @param args - Complete arguments passed to the pinned Bun executable.
 * @returns After physical runner exit, rejecting a failed compiler or service suite.
 */
async function runServiceGate(name: string, args: readonly string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${name} failed with exit ${code}.`);
}
