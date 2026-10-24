/** Reuses retained warm benchmark roots for serial four-boundary public import evidence, without installing or admitting SDKs. */
import { readFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { retainedBoundaryFixtures } from "./consumer-retained-boundary-fixtures.js";
import { verifyConsumerBoundaries } from "./verify-consumer-boundaries.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { scaffoldProcessLayer } from "./scaffold-process.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { inspectConsumerResources } from "./consumer-resources.js";
import type { RetainedBoundaryResult } from "./consumer-retained-boundary.types.js";
import {
  RetainedWarmReport as WarmReport,
  RetainedBoundaryInputs as Inputs,
} from "./consumer-retained-boundary.schemas.js";

/** Requires one successful retained warm sample per generic fixture and explicit layout. */
const warmSamples = Effect.fn("RetainedBoundaries.samples")(function* (
  input: string,
  manager: string,
) {
  const text = yield* inspectionNative("retained.input", () => readFile(input, "utf8"));
  const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Inputs))(text);
  if (parsed.reports.length === 0 || parsed.reports.length > 16)
    return yield* consumerInputFailure(
      "retained.reports",
      "Expected 1–16 explicit retained report paths",
    );
  const samples = [];
  for (const report of parsed.reports) {
    const bytes = yield* inspectionNative("retained.report", () =>
      readFile(resolve(dirname(input), report), "utf8"),
    );
    const value = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(WarmReport))(bytes);
    samples.push(
      ...(value.result?.samples ?? []).filter(
        (sample) =>
          sample.manager === manager &&
          sample.condition === "warm-owned-cache" &&
          sample.failure === null,
      ),
    );
  }
  return samples;
});

/** Confines new probe source to an explicitly retained external root and preserves conflicting bytes. */
const prepareEntry = Effect.fn("RetainedBoundaries.entry")(function* (
  root: string,
  source: string,
) {
  const canonical = yield* inspectionNative("retained.root", () => realpath(root));
  const repository = yield* inspectionNative("retained.repository", () =>
    realpath(resolve(import.meta.dir, "..")),
  );
  const child = relative(repository, canonical);
  if (child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith("../")))
    return yield* consumerInputFailure(
      "retained.containment",
      "Retained probes require external consumer roots",
    );
  const entry = join(canonical, ".consumer-probe/retained-public-entry.ts");
  yield* inspectionNative("retained.entry", async () => {
    await mkdir(join(canonical, ".consumer-probe"), { recursive: true });
    try {
      await writeFile(entry, source, { flag: "wx" });
    } catch (cause) {
      if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "EEXIST") throw cause;
      if ((await readFile(entry, "utf8")) !== source)
        throw new Error("Retained probe entry already contains different bytes", { cause });
    }
  });
  return { root: canonical, entry };
});

/** Captures raw observations only; exact CLI inspector admissions remain a separately reviewed policy.
 * @param input - JSON naming the exact retained Stage 1 measurement reports.
 * @param output - Destination for independent per-fixture observations and summary.
 * @param manager - Explicit native installer layout whose warm roots are inspected.
 * @returns Seven raw observations after serial completion; failures retain prior evidence.
 */
export const verifyRetainedConsumerBoundaries = Effect.fn("RetainedBoundaries.verify")(function* (
  input: string,
  output: string,
  manager: "bun" | "bun-isolated" | "npm" | "pnpm",
) {
  const samples = yield* warmSamples(input, manager);
  yield* inspectionNative("retained.output", () => mkdir(output, { recursive: true }));
  const results: RetainedBoundaryResult[] = [];
  for (const fixture of retainedBoundaryFixtures) {
    const admission = yield* inspectConsumerResources(output);
    if (admission.blocked !== null)
      return yield* consumerInputFailure("retained.resources", admission.blocked);
    const matches = samples.filter((sample) => sample.fixture === fixture.name);
    if (matches.length !== 1)
      return yield* consumerInputFailure(
        "retained.selection",
        `Expected one warm ${manager}/${fixture.name} sample; found ${matches.length}`,
      );
    const sample = matches[0];
    if (sample === undefined)
      return yield* consumerInputFailure("retained.selection", "Warm sample disappeared");
    const entry = yield* prepareEntry(sample.root, fixture.source);
    const evidence = join(output, `${manager}-${fixture.name}.json`);
    const observations = yield* verifyConsumerBoundaries(
      entry.root,
      entry.entry,
      evidence,
      fixture.development,
    );
    results.push({
      fixture: fixture.name,
      manager,
      root: entry.root,
      evidence,
      observations,
    });
    yield* inspectionNative("retained.summary", () =>
      writeFile(join(output, `${manager}-summary.json`), JSON.stringify(results, null, 2)),
    );
  }
  return results;
});

if (import.meta.main) {
  const [input, output, manager] = process.argv.slice(2);
  if (
    input === undefined ||
    output === undefined ||
    !["bun", "bun-isolated", "npm", "pnpm"].includes(manager ?? "")
  )
    throw new Error(
      "Usage: bun scripts/verify-retained-consumer-boundaries.ts <reports-input.json> <evidence-dir> <bun|bun-isolated|npm|pnpm>",
    );
  const selected = Schema.decodeUnknownSync(
    Schema.Literals(["bun", "bun-isolated", "npm", "pnpm"]),
  )(manager);
  await runBenchmarkMain(
    verifyRetainedConsumerBoundaries(resolve(input), resolve(output), selected).pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
}
