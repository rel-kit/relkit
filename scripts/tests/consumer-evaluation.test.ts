/** Calibrates real Bun VM observation against failed evaluation and CommonJS cache eviction. */
import { cp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { expect, test } from "bun:test";
import { consumerProbeFixture } from "./consumer-probe.fixture.js";
import { inspectInstallation } from "../consumer-installation.js";
import { probeConsumerEvaluation } from "../consumer-evaluation-probe.js";

test("VM observations retain caught evaluation failures and evicted CommonJS modules", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(
      join(root, "node_modules/fixture-sdk/throws.js"),
      'throw new Error("expected module failure");',
    );
    await writeFile(join(root, "node_modules/fixture-sdk/evicted.cjs"), "module.exports=42;");
    await writeFile(
      join(root, "entry.ts"),
      [
        'try { await import("./node_modules/fixture-sdk/throws.js"); } catch (cause) { if(cause.message!=="expected module failure") throw cause; }',
        'const loaded=require("./node_modules/fixture-sdk/evicted.cjs");',
        'delete require.cache[require.resolve("./node_modules/fixture-sdk/evicted.cjs")];',
        'if(loaded!==42)throw new Error("native CJS failed");console.log("eviction-ok");',
      ].join("\n"),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* probeConsumerEvaluation(
          root,
          "entry.ts",
          yield* inspectInstallation(root),
          "consumer",
        );
      }).pipe(Effect.scoped),
    );
    expect(result.evaluation.complete).toBe(true);
    expect(result.files.some((file) => file.endsWith("/fixture-sdk/throws.js"))).toBe(true);
    expect(result.files.some((file) => file.endsWith("/fixture-sdk/evicted.cjs"))).toBe(true);
    expect(result.nativeOutput).toContain("eviction-ok");
    expect(result.evaluation.paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "fixture-sdk"] }),
    );
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed VM collector calibration retained: ${root}`);
  }
}, 30_000);

test("the debugger cannot turn a finite consumer's failing exit code into success", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(join(root, "entry.ts"), "process.exitCode=7;");
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit(
          probeConsumerEvaluation(root, "entry.ts", yield* inspectInstallation(root), "consumer"),
        );
      }).pipe(Effect.scoped),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") expect(String(exit.cause)).toContain("probe.evaluationTrace");
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed exit calibration retained: ${root}`);
  }
}, 30_000);

test("the VM records the real compiler with its native inline source map", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    const typescript = dirname(fileURLToPath(import.meta.resolve("typescript/package.json")));
    await cp(typescript, join(root, "node_modules/typescript"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "consumer", dependencies: { typescript: "5.9.3" } }),
    );
    await writeFile(
      join(root, "entry.ts"),
      'import ts from "typescript"; console.log(ts.version);',
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* probeConsumerEvaluation(
          root,
          "entry.ts",
          yield* inspectInstallation(root),
          "consumer",
        );
      }).pipe(Effect.scoped),
    );
    expect(result.nativeOutput).toContain("5.9.3");
    expect(result.evaluation.complete).toBe(true);
    expect(result.files.some((file) => file.endsWith("/typescript/lib/typescript.js"))).toBe(true);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed real compiler VM probe retained: ${root}`);
  }
}, 30_000);

test("CommonJS evaluation retains its conditional require export", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(
      join(root, "node_modules/fixture-sdk/package.json"),
      JSON.stringify({
        name: "fixture-sdk",
        version: "1.0.0",
        exports: {
          ".": { import: "./index.js", require: "./required.cjs" },
        },
      }),
    );
    await writeFile(join(root, "node_modules/fixture-sdk/required.cjs"), "exports.answer=42;");
    await writeFile(
      join(root, "entry.ts"),
      'if(require("fixture-sdk").answer!==42)throw Error("require failed");',
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* probeConsumerEvaluation(
          root,
          "entry.ts",
          yield* inspectInstallation(root),
          "consumer",
        );
      }).pipe(Effect.scoped),
    );
    expect(result.evaluation.complete).toBe(true);
    expect(result.files.some((file) => file.endsWith("/fixture-sdk/required.cjs"))).toBe(true);
    expect(result.files.some((file) => file.endsWith("/fixture-sdk/index.js"))).toBe(false);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed conditional require probe retained: ${root}`);
  }
}, 30_000);
