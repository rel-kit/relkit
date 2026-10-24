/** Runs both browser suites serially and reports a failed suite after both settle. */
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { Effect } from "effect";
import { ScaffoldProcess } from "./scaffold-process.js";
import { playwrightSuite } from "./playwright-suite.js";
import { runPlaywright } from "./playwright-runner.js";

const root = resolve(import.meta.dir, "..");
const require = createRequire(import.meta.url);
const native = createRequire(require.resolve("@playwright/test/package.json"));
const cli = join(dirname(native.resolve("playwright/package.json")), "cli.js");
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const program = Effect.gen(function* () {
  const results: { name: string; code: number }[] = [];
  for (const name of ["inspector", "commerce"] as const) {
    const startedAt = performance.now();
    const code = yield* Effect.scoped(
      Effect.gen(function* () {
        const selected = yield* playwrightSuite(root, name);
        console.log(`${name} browser evidence: ${selected.artifacts}`);
        if (name === "commerce") {
          const commands = yield* ScaffoldProcess.make;
          yield* commands.run({ cwd: join(root, "examples/commerce"), args: ["run", "check"] });
        }
        return yield* runPlaywright(
          {
            executable: "node",
            cwd: root,
            args: [
              cli,
              "test",
              ...(name === "commerce" ? ["--config=playwright.commerce.config.ts"] : []),
            ],
            env: { ...selected.environment, NODE_OPTIONS: "--max-old-space-size=768" },
          },
          selected.artifacts,
        );
      }),
    );
    console.log(`${name} browser suite: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
    results.push({ name, code });
  }
  const failure = results.find(({ code }) => code !== 0);
  if (failure !== undefined)
    return yield* Effect.fail(new Error(`${failure.name} browser suite failed.`));
});
try {
  await Effect.runPromise(program, { signal: controller.signal });
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
