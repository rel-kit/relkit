/**
 * Discovers every owning add-acceptance file and runs each assertion exactly once.
 * Native child Scopes join exit and both output streams before the next generator
 * gate starts; test-name partitioning remains explicit and zero matches fail.
 */
import { resolve } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldChild } from "./scaffold-process.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

const root = resolve(import.meta.dir, "..");

/** Discovers native acceptance owners before partitioning the original named cohorts.
 * @returns Stable compilation/addition/other suite arguments with no duplicated files.
 */
function generatorSuites() {
  const files = [
    ...new Bun.Glob("**/*.test.ts").scanSync({
      cwd: resolve(root, "tests/generator"),
      onlyFiles: true,
    }),
  ]
    .map((file) => `tests/generator/${file}`)
    .sort();
  const acceptance = files.filter((file) =>
    /^tests\/generator\/add(?:-[a-z]+)*-acceptance\.test\.ts$/.test(file),
  );
  if (acceptance.length === 0) throw new Error("No generator acceptance owners were found.");
  const accepted = new Set(acceptance);
  const compilationPrefixes = [
    "the full bundle",
    "route platform",
    "database and auth",
    "reused Docker profiles",
  ];
  const compilationNames = `(?:${compilationPrefixes.join("|")})`;
  return [
    ...compilationPrefixes.map((prefix) => ({
      name: `acceptance compilation: ${prefix}`,
      args: ["test", "--test-name-pattern", `^${prefix}`, ...acceptance],
    })),
    {
      name: "acceptance additions",
      args: ["test", "--test-name-pattern", `^(?!${compilationNames})`, ...acceptance],
    },
    ...files
      .filter((file) => !accepted.has(file))
      .map((file) => ({ name: `generator: ${file}`, args: ["test", file] })),
  ];
}

/** Joins one real native gate while preserving its stdout, stderr and nonzero failure.
 * @param name - Fixed diagnostic cohort label.
 * @param args - Original arguments passed to pinned Bun.
 * @returns Completion only after the child and both native drains settle.
 */
const runGeneratorGate = Effect.fn("GeneratorGate.run")((name: string, args: readonly string[]) =>
  observeExecution(
    "testing",
    "generator.gate",
    Effect.scoped(
      Effect.gen(function* () {
        const startedAt = performance.now();
        const owner = yield* scaffoldChild({ args, cwd: root });
        const [exit, stdout, stderr] = yield* Effect.promise(() => owner.settled);
        if (
          exit.status !== "fulfilled" ||
          stdout.status !== "fulfilled" ||
          stderr.status !== "fulfilled"
        )
          return yield* new ScaffoldProcessFailure({
            operation: "generator.drain",
            message: "Native generator exit/output did not settle",
          });
        yield* Effect.sync(() => {
          process.stdout.write(stdout.value);
          process.stderr.write(stderr.value);
          console.log(`${name}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
        });
        if (exit.value !== 0)
          return yield* new ScaffoldProcessFailure({
            operation: "generator.exit",
            message: `${name} failed with exit ${exit.value}.`,
          });
      }),
    ).pipe(Effect.timeout("10 minutes")),
  ),
);

/** Runs required service gates and every original native generator acceptance cohort.
 * @returns Joined completion; no assertion, compiler budget or readiness threshold changes.
 */
const main = Effect.gen(function* () {
  yield* runGeneratorGate("generator strict services", [
    "x",
    "tsc",
    "-p",
    "packages/create-relkit/tsconfig.tests.json",
    "--pretty",
    "false",
  ]);
  yield* runGeneratorGate("generator Effect services", [
    "x",
    "--bun",
    "vitest",
    "run",
    "--config",
    "packages/create-relkit/vitest.config.ts",
    "--maxWorkers=1",
  ]);
  yield* runGeneratorGate("scaffolding strict services", [
    "x",
    "tsc",
    "-p",
    "packages/cli/tsconfig.scaffolding-tests.json",
    "--pretty",
    "false",
  ]);
  yield* runGeneratorGate("scaffolding Effect services", [
    "x",
    "--bun",
    "vitest",
    "run",
    "--config",
    "packages/cli/vitest.scaffolding.config.ts",
    "--maxWorkers=1",
  ]);
  yield* runGeneratorGate("scaffolding portable dependency patches", [
    "test",
    "packages/cli/tests/scaffolding/dependency-patches.test.ts",
    "packages/cli/tests/scaffolding/project-catalog.test.ts",
  ]);
  const suites = yield* Effect.sync(generatorSuites);
  yield* Effect.forEach(suites, ({ name, args }) => runGeneratorGate(name, args), {
    concurrency: 1,
    discard: true,
  });
});

if (import.meta.main) await runBenchmarkMain(main);
