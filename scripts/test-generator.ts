import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const testRoot = resolve(root, "tests/generator");
const acceptance = "tests/generator/add-acceptance.test.ts";
const compilationNames = "(?:the full bundle|route platform|database and auth)";
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

const results = await Promise.all(
  suites.map(async ({ name, args }) => {
    const startedAt = performance.now();
    const child = Bun.spawn([process.execPath, "test", ...args], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    console.log(`${name}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
    return { name, code };
  }),
);
const failure = results.find(({ code }) => code !== 0);
if (failure !== undefined) throw new Error(`${failure.name} failed.`);
