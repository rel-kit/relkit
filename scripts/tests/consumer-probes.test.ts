/** Exercises native package resolution; these synthetic packages test the collectors only. */
import { cp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { expect, test } from "bun:test";
import { consumerAmbientFixture, consumerProbeFixture } from "./consumer-probe.fixture.js";
import { inspectInstallation } from "../consumer-installation.js";
import { probeConsumerDeclarations } from "../consumer-declaration-probe.js";
import { probeConsumerBundle } from "../consumer-bundle-probe.js";
import { probeConsumerEvaluation } from "../consumer-evaluation-probe.js";
import { scaffoldProcessLayer } from "../scaffold-process.js";
import { verifyConsumerBoundaries } from "../verify-consumer-boundaries.js";
import type { DependencyPath } from "../consumer-dependency-policy.types.js";

/** Independently observed module closures must all expose the hoisted SDK bypass. */
function expectSdkPaths(observations: readonly (readonly DependencyPath[])[]) {
  for (const paths of observations)
    expect(paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "fixture-app", "fixture-sdk"] }),
    );
}

test("declaration and artifact collectors trace undeclared hoisted module edges independently", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const installation = yield* inspectInstallation(root);
        const declarations = yield* probeConsumerDeclarations(
          root,
          "entry.ts",
          installation,
          "consumer",
        );
        const bundle = yield* probeConsumerBundle(root, "entry.ts", installation, "consumer");
        const evaluation = yield* probeConsumerEvaluation(
          root,
          "entry.ts",
          installation,
          "consumer",
        );
        return { installation, declarations, bundle, evaluation };
      }).pipe(Effect.provide(scaffoldProcessLayer), Effect.scoped),
    );
    expect(result.declarations.diagnostics).toEqual([]);
    expect(result.declarations.unreached).toEqual([]);
    expect(result.bundle.unreached).toEqual([]);
    expect(result.bundle.nativeOutput).toContain("native-ok");
    expect(result.evaluation.nativeOutput).toContain("native-ok");
    expect(result.evaluation.evaluation.complete).toBe(true);
    expect(result.bundle.artifactOutput).toContain("native-ok");
    const path = ["consumer", "fixture-app", "fixture-sdk"];
    expect(
      result.installation.paths.some(
        (item) => JSON.stringify(item.packages) === JSON.stringify(path),
      ),
    ).toBe(false);
    expectSdkPaths([
      result.declarations.observation.paths,
      result.bundle.artifact.paths,
      result.evaluation.evaluation.paths,
    ]);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed consumer probe retained: ${root}`);
  }
}, 30_000);

test("strict declarations reject wrong inferred output without suppression", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(
      join(root, "negative.ts"),
      'import {answer} from "fixture-app"; const invalid: string = answer();',
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* probeConsumerDeclarations(
          root,
          "negative.ts",
          yield* inspectInstallation(root),
          "consumer",
        );
      }),
    );
    expect(result.diagnostics.map((item) => item.code)).toEqual([2322]);
    expect(result.observation.complete).toBe(false);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed consumer probe retained: ${root}`);
  }
}, 30_000);

test("explicit ambient types resolve from the consumer instead of the tool workspace", async () => {
  const root = await consumerProbeFixture();
  const originalDirectory = process.cwd();
  let complete = false;
  try {
    const toolRoot = await consumerAmbientFixture(root);
    process.chdir(toolRoot);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* probeConsumerDeclarations(
          root,
          "ambient.ts",
          yield* inspectInstallation(root),
          "consumer",
          ["consumer-owned"],
        );
      }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.observation.complete).toBe(true);
    expect(result.observation.paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "@types/consumer-owned"] }),
    );
    complete = true;
  } finally {
    process.chdir(originalDirectory);
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed consumer ambient probe retained: ${root}`);
  }
}, 30_000);

test("production boundaries do not request uninstalled development typings", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "consumer",
        dependencies: { "fixture-app": "1.0.0", "fixture-cli": "1.0.0" },
        devDependencies: { "@types/bun": "1.3.10" },
      }),
    );
    const observations = await Effect.runPromise(
      verifyConsumerBoundaries(root, "entry.ts", join(root, "evidence.json"), false).pipe(
        Effect.provide(scaffoldProcessLayer),
        Effect.scoped,
      ),
    );
    expect(observations).toHaveLength(4);
    expect(
      observations.find((observation) => observation.boundary === "declarations")?.complete,
    ).toBe(true);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed production probe retained: ${root}`);
  }
}, 30_000);

test("real CommonJS bundles retain native Bun built-ins without filesystem edges", async () => {
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
        return yield* probeConsumerBundle(
          root,
          "entry.ts",
          yield* inspectInstallation(root),
          "consumer",
        );
      }).pipe(Effect.provide(scaffoldProcessLayer), Effect.scoped),
    );
    expect(result.nativeOutput.trim()).toBe("5.9.3");
    expect(result.artifactOutput.trim()).toBe("5.9.3");
    expect(result.artifact.complete).toBe(true);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed native CommonJS probe retained: ${root}`);
  }
}, 30_000);
