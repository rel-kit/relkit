/**
 * Executes a finite external fixture under Bun's actual VM debugger.
 * Parse events conservatively include attempted evaluation, even after a caught
 * failure or cache eviction. Source edges are reconstructed, never claimed as VM edges.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import ts from "typescript";
import { scaffoldChild } from "./scaffold-process.js";
import { recordConsumerScripts } from "./consumer-evaluation-native.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { consumerModulePaths } from "./consumer-module-paths.js";
import { consumerModuleImports } from "./consumer-module-imports.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";
import type { ConsumerModuleEdge } from "./consumer-module-paths.types.js";

/**
 * Reconstructs conservative source edges among files recorded by the VM.
 * @param files - Native VM script paths, excluding the finite wrapper itself.
 * @returns Resolvable source edges; unaccounted observed files keep the gate incomplete.
 */
const evaluatedEdges = Effect.fn("ConsumerProbe.evaluatedEdges")(function* (
  files: readonly string[],
) {
  const loaded = new Set(files);
  const edges: ConsumerModuleEdge[] = [];
  for (const from of files) {
    const source = yield* inspectionNative("probe.evaluationSource", () => readFile(from, "utf8"));
    const parsed = ts.createSourceFile(from, source, ts.ScriptTarget.Latest);
    for (const imported of consumerModuleImports(parsed)) {
      for (const resolveModule of [
        () => Bun.resolveSync(imported, dirname(from)),
        () => createRequire(from).resolve(imported),
      ]) {
        try {
          const to = realpathSync(resolveModule());
          if (loaded.has(to)) edges.push({ from, to });
        } catch {
          continue;
        }
      }
    }
  }
  return edges;
});

/** Creates fresh wrapper/evidence identities so an old observation cannot satisfy a new execution. */
const prepareEvaluation = Effect.fn("ConsumerProbe.prepareEvaluation")(function* (
  root: string,
  entry: string,
) {
  const directory = join(root, ".consumer-probe");
  const nonce = randomUUID();
  const observer = join(directory, `observe-${nonce}.mjs`),
    evidence = join(directory, `evaluated-${nonce}.json`);
  const marker = `RELKIT_CONSUMER_COMPLETE_${nonce}`;
  yield* inspectionNative("probe.observer", async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      observer,
      `await import(${JSON.stringify(resolve(root, entry))});\nconsole.log(${JSON.stringify(marker)});\n`,
    );
  });
  return { nonce, observer, evidence, marker };
});

/**
 * Records conservative attempted native evaluation without replacing imports or SDKs.
 * @param root - External consumer root and execution resolution boundary.
 * @param entry - Actual consumer entry relative to root.
 * @param installation - Independent physical package ownership observations.
 * @param consumerName - Consumer identity used in observed package paths.
 * @returns Native stdout, evaluated files and a completeness-checked graph.
 */
export const probeConsumerEvaluation = Effect.fn("ConsumerProbe.evaluation")(function* (
  root: string,
  entry: string,
  installation: ConsumerInstallation,
  consumerName: string,
) {
  const { nonce, observer, evidence, marker } = yield* prepareEvaluation(root, entry);
  const child = yield* scaffoldChild({
    cwd: root,
    args: ["run", "--no-install", "--no-env-file", `--inspect-wait=127.0.0.1:0/${nonce}`, observer],
    env: { NODE_ENV: "production" },
  });
  const loaded = yield* inspectionNative("probe.evaluationTrace", () =>
    recordConsumerScripts(child, marker),
  );
  const files = loaded.filter((file) => isAbsolute(file) && file !== realpathSync(observer));
  const [exit, stdout, stderr] = yield* Effect.promise(() => child.settled);
  if (exit.status !== "fulfilled" || stdout.status !== "fulfilled" || stderr.status !== "fulfilled")
    return yield* consumerInputFailure(
      "probe.evaluationSettlement",
      "Observed native exit or output did not settle",
    );
  const nativeOutput = stdout.value;
  yield* inspectionNative("probe.evaluationEvidence", () =>
    writeFile(evidence, JSON.stringify({ nonce, files }, null, 2) + "\n"),
  );
  const edges = yield* evaluatedEdges(files);
  const graph = yield* inspectionNative("probe.evaluationGraph", async () =>
    consumerModulePaths(
      resolve(root, entry),
      files,
      edges,
      root,
      installation,
      "evaluation",
      consumerName,
    ),
  );
  return {
    nativeOutput,
    files,
    unreached: graph.unreached,
    evaluation: {
      boundary: "evaluation" as const,
      evidence,
      complete: graph.unreached.length === 0,
      paths: graph.paths,
    },
  };
});
