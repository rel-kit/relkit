import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const suites = [
  { name: "inspector", args: ["test", "--output=test-results/inspector"] },
  {
    name: "commerce",
    args: ["test", "--config=playwright.commerce.config.ts", "--output=test-results/commerce"],
  },
] as const;

const results = await Promise.all(
  suites.map(async ({ name, args }) => {
    const startedAt = performance.now();
    const child = Bun.spawn([process.execPath, "x", "playwright", ...args], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    console.log(`${name} browser suite: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
    return { name, code };
  }),
);
const failure = results.find(({ code }) => code !== 0);
if (failure !== undefined) throw new Error(`${failure.name} browser suite failed.`);
