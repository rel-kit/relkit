/** Records four independent consumer boundaries from an already installed external fixture. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "effect";
import { scaffoldProcessLayer } from "./scaffold-process.js";
import { inspectionNative, readConsumerManifest } from "./consumer-installation-native.js";
import { inspectInstallation } from "./consumer-installation.js";
import { probeConsumerDeclarations } from "./consumer-declaration-probe.js";
import { probeConsumerBundle } from "./consumer-bundle-probe.js";
import { probeConsumerEvaluation } from "./consumer-evaluation-probe.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/** Installation paths are never reused as executable or declaration evidence. */
export const verifyConsumerBoundaries = Effect.fn("ConsumerProbe.verify")(function* (
  root: string,
  entry: string,
  evidence: string,
  development: boolean,
) {
  const manifest = yield* readConsumerManifest(root);
  const installation = yield* inspectInstallation(root, { development });
  const declarations = yield* probeConsumerDeclarations(
    root,
    entry,
    installation,
    manifest.name,
    development && Object.hasOwn(manifest.devDependencies ?? {}, "@types/bun") ? ["bun"] : [],
  );
  const bundle = yield* probeConsumerBundle(root, entry, installation, manifest.name);
  const evaluation = yield* probeConsumerEvaluation(root, entry, installation, manifest.name);
  const observations = [
    {
      boundary: "installation" as const,
      complete: installation.missing.length === 0,
      evidence,
      paths: installation.paths,
    },
    evaluation.evaluation,
    declarations.observation,
    { ...bundle.artifact, evidence },
  ];
  yield* inspectionNative("probe.evidence", () =>
    writeFile(
      evidence,
      JSON.stringify({
        policy: { stage: "1", exceptions: [] },
        observations,
        details: { root, entry, installation, declarations, evaluation, bundle },
      }) + "\n",
    ),
  );
  return observations;
});

if (import.meta.main) {
  const [root, entry, evidence, mode] = process.argv.slice(2);
  if (
    root === undefined ||
    entry === undefined ||
    evidence === undefined ||
    (mode !== undefined && mode !== "production")
  )
    throw new Error(
      "Usage: bun scripts/verify-consumer-boundaries.ts <external-root> <entry.ts> <evidence.json> [production]",
    );
  await runBenchmarkMain(
    verifyConsumerBoundaries(resolve(root), entry, resolve(evidence), mode !== "production").pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
}
