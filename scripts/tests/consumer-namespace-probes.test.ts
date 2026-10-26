/** Calibrates namespace reexports and real disposable libs without weakening native graph completeness. */
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { expect, test } from "bun:test";
import { consumerProbeFixture } from "./consumer-probe.fixture.js";
import { inspectInstallation } from "../consumer-installation.js";
import { probeConsumerDeclarations } from "../consumer-declaration-probe.js";
import { probeConsumerEvaluation } from "../consumer-evaluation-probe.js";

/** Gives the collectors actual runtime/types namespace exports and native disposable protocols. */
async function namespaceFixture(root: string) {
  for (const extension of ["js", "d.ts"])
    await writeFile(
      join(root, `node_modules/fixture-app/index.${extension}`),
      'export * as sdk from "fixture-sdk";',
    );
  await writeFile(
    join(root, "node_modules/fixture-sdk/index.d.ts"),
    "export declare function answer(): 42; export interface Resource extends Disposable, AsyncDisposable {}",
  );
  await writeFile(
    join(root, "entry.ts"),
    'import {sdk} from "fixture-app"; const answer: 42 = sdk.answer(); const resource: sdk.Resource | undefined = undefined; if(answer!==42||resource!==undefined)throw new Error("namespace result failed"); console.log("namespace-ok");',
  );
}

test("native namespace reexports retain observed runtime and strict disposable declaration edges", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await namespaceFixture(root);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const installation = yield* inspectInstallation(root);
        const declarations = yield* probeConsumerDeclarations(
          root,
          "entry.ts",
          installation,
          "consumer",
        );
        const evaluation = yield* probeConsumerEvaluation(
          root,
          "entry.ts",
          installation,
          "consumer",
        );
        return { declarations, evaluation };
      }).pipe(Effect.scoped),
    );
    expect(result.declarations.diagnostics).toEqual([]);
    expect(result.declarations.unreached).toEqual([]);
    expect(result.declarations.observation.complete).toBe(true);
    expect(result.evaluation.unreached).toEqual([]);
    expect(result.evaluation.evaluation.complete).toBe(true);
    expect(result.evaluation.nativeOutput).toContain("namespace-ok");
    for (const paths of [result.declarations.observation.paths, result.evaluation.evaluation.paths])
      expect(paths).toContainEqual(
        expect.objectContaining({ packages: ["consumer", "fixture-app", "fixture-sdk"] }),
      );
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed namespace collector calibration retained: ${root}`);
  }
}, 30_000);

test("native completion cannot admit an observed computed-import module without a reconstructed edge", async () => {
  const root = await consumerProbeFixture();
  let complete = false;
  try {
    await writeFile(join(root, "detached.js"), "export const loaded = true;");
    await writeFile(
      join(root, "entry.ts"),
      'const target="./detached.js"; await import(target); console.log("disconnected-ok");',
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
    expect(result.nativeOutput).toContain("disconnected-ok");
    expect(result.nativeOutput).toContain("RELKIT_CONSUMER_COMPLETE_");
    expect(result.files.some((file) => file.endsWith("/detached.js"))).toBe(true);
    expect(result.unreached.some((file) => file.endsWith("/detached.js"))).toBe(true);
    expect(result.evaluation.complete).toBe(false);
    complete = true;
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
    else console.error(`Failed disconnected collector calibration retained: ${root}`);
  }
}, 30_000);
