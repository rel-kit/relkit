import { canonicalJson, RELKIT_DESCRIPTOR } from "../../packages/contracts/src/index.ts";
import { canonicalGraphJson } from "../../packages/graph/src/index.ts";
import {
  checkConventions,
  evaluateCandidates,
  extractDescriptors,
  loadConfig,
  normalizeCompilation,
  prefilterSources,
  type NormalizationResult,
} from "../../packages/compiler/src/index.ts";
import type { ExtractedDescriptor } from "../../packages/compiler/src/discovery/extract.ts";
import type { EvaluatorResponse } from "../../packages/compiler/src/discovery/evaluator-protocol.ts";
import type { Diagnostic } from "../../packages/diagnostics/src/index.ts";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const COMPILER_FIXTURES = Object.freeze([
  "valid-minimal",
  "valid-full",
  "valid-inferred-identities",
  "warning-wrong-directory",
  "warning-wrong-suffix",
  "error-duplicate-id",
  "error-ambiguous-id",
  "error-inferred-collision",
  "error-route-collision",
  "error-missing-target",
  "error-event-target",
  "error-provider-profile",
] as const);

export interface FixtureCompilation {
  readonly name: string;
  readonly temporaryRoot: string;
  readonly evaluator: EvaluatorResponse;
  readonly extracted: readonly ExtractedDescriptor[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagnosticsBytes: string;
  readonly graphBytes: string;
  readonly graphHash: string;
  readonly exitCode: number;
  readonly manifest: string;
  readonly normalization: NormalizationResult;
}

export type FixtureEnumeration = "sorted" | "reverse" | "random";

export interface FixtureCompilationOptions {
  readonly order?: FixtureEnumeration;
  readonly generationId?: string;
}

/** Compiles one fixture from an isolated root and removes that root afterward. */
export async function compileFixture(
  name: (typeof COMPILER_FIXTURES)[number],
  options: boolean | FixtureCompilationOptions = false,
): Promise<FixtureCompilation> {
  const normalizedOptions =
    typeof options === "boolean"
      ? { order: options ? ("reverse" as const) : ("sorted" as const) }
      : options;
  return compileProject(name, resolve(import.meta.dir, "fixtures", name), normalizedOptions);
}

/** Compiles an isolated application root using its checked-in relkit.config.ts. */
export async function compileProject(
  name: string,
  projectRoot: string,
  options: FixtureCompilationOptions = {},
): Promise<FixtureCompilation> {
  const order = options.order ?? "sorted";
  const temporaryRoot = await mkdtemp(join(tmpdir(), "relkit-compiler-fixture-"));
  try {
    await prepareRoot(projectRoot, temporaryRoot);
    const config = await loadFixtureConfig(temporaryRoot, name);
    const sources = await readSources(temporaryRoot, config.source);
    const configSource = "relkit.config.ts";
    const discoverySources = [
      ...sources.filter((source) => source.fileName !== configSource),
      { fileName: configSource, text: await readFile(join(temporaryRoot, configSource), "utf8") },
    ];
    const prefiltered = prefilterSources(discoverySources, {
      projectRoot: temporaryRoot,
      exclude: config.exclude,
    });
    const candidates = orderCandidates(
      prefiltered.candidates.map((candidate) => candidate.fileName),
      order,
    );
    const evaluator = await evaluateCandidates({
      projectRoot: temporaryRoot,
      candidates: candidates.map((fileName) =>
        prefiltered.candidates.find((candidate) => candidate.fileName === fileName)!,
      ),
      generationId: options.generationId ?? `fixture-${name}-${order}`,
    });
    if (evaluator.status !== "ok") {
      throw new Error(canonicalJson({ fixture: name, failures: evaluator.failures }));
    }
    const normalization = normalizeCompilation({
      evaluator,
      projectRoot: temporaryRoot,
      sources: discoverySources,
    });
    const extracted = extractDescriptors(evaluator, {
      projectRoot: temporaryRoot,
      sources: discoverySources,
    });
    const diagnostics = sortDiagnostics([
      ...normalization.diagnostics,
      ...extracted.flatMap((descriptor) =>
        checkConventions({
          descriptor: conventionDescriptor(descriptor.descriptor.kind, descriptor.descriptor.id),
          sourcePath: descriptor.reference.module,
          projectRoot: temporaryRoot,
          location: descriptor.source,
          exportKind: descriptor.exportKind,
        }),
      ),
    ]) as readonly Diagnostic[];
    const stableDiagnostics = stabilizeUnbound(diagnostics) as readonly Diagnostic[];
    const stableGraph = stabilizeUnbound(normalization.graph);
    const graphBytes = stableGraph
      ? `${canonicalGraphJson(stableGraph as NonNullable<typeof normalization.graph>)}\n`
      : "";
    return {
      name,
      temporaryRoot,
      evaluator,
      extracted,
      diagnostics: stableDiagnostics,
      diagnosticsBytes: `${canonicalJson(stableDiagnostics)}\n`,
      graphBytes,
      graphHash: normalization.graphHash ?? "",
      exitCode: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0,
      manifest: normalization.outputs.manifest,
      normalization,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function stabilizeUnbound(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/unbound\.[0-9a-f]{8}-[0-9a-f-]{27}/gi, "unbound.fixture");
  }
  if (Array.isArray(value)) return value.map(stabilizeUnbound);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, stabilizeUnbound(child)]),
  );
}

function orderCandidates(candidates: readonly string[], order: FixtureEnumeration): string[] {
  const result = [...candidates];
  if (order === "sorted") return result;
  if (order === "reverse") return result.reverse();

  let state = 0x9e3779b9;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 16), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    state ^= state >>> 16;
    const target = (state >>> 0) % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/** Compares fixture goldens and updates them only when explicitly requested. */
export async function assertFixtureGoldens(run: FixtureCompilation): Promise<void> {
  const fixtureRoot = resolve(import.meta.dir, "fixtures", run.name);
  await assertJsonGolden(join(fixtureRoot, "expected.diagnostics.json"), run.diagnosticsBytes, run);
  await assertTextGolden(join(fixtureRoot, "expected.exit-code"), `${run.exitCode}\n`, run);
  const graphPath = join(fixtureRoot, "expected.graph.json");
  if (existsSync(graphPath)) await assertGraphGolden(graphPath, run.graphBytes, run);
}

async function prepareRoot(fixtureRoot: string, temporaryRoot: string): Promise<void> {
  await cp(join(fixtureRoot, "src"), join(temporaryRoot, "src"), { recursive: true });
  await cp(join(fixtureRoot, "relkit.config.ts"), join(temporaryRoot, "relkit.config.ts"));
  if (existsSync(join(fixtureRoot, "tsconfig.json"))) {
    await cp(join(fixtureRoot, "tsconfig.json"), join(temporaryRoot, "tsconfig.json"));
  }
  await linkFixtureDependencies(fixtureRoot, temporaryRoot);
  const scope = join(temporaryRoot, "node_modules", "@relkit");
  await mkdir(scope, { recursive: true });
  for (const entry of await readdir(resolve(import.meta.dir, "../../packages"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = resolve(import.meta.dir, "../../packages", entry.name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      readonly name?: string;
    };
    if (manifest.name?.startsWith("@relkit/")) {
      await symlink(packageRoot, join(temporaryRoot, "node_modules", manifest.name), "dir");
    }
  }
}

async function linkFixtureDependencies(fixtureRoot: string, temporaryRoot: string): Promise<void> {
  const manifestPath = join(fixtureRoot, "package.json");
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort();
  for (const name of names) {
    if (name.startsWith("@relkit/")) continue;
    const source = join(fixtureRoot, "node_modules", name);
    if (!existsSync(source)) continue;
    const target = join(temporaryRoot, "node_modules", name);
    await mkdir(join(target, ".."), { recursive: true });
    await symlink(source, target, "dir");
  }
}

async function loadFixtureConfig(root: string, name: string) {
  const path = pathToFileURL(join(root, "relkit.config.ts")).href;
  const module = (await import(`${path}?fixture=${name}`)) as { readonly default: unknown };
  return loadConfig(module.default, root);
}

async function readSources(
  root: string,
  patterns: readonly string[],
): Promise<readonly { readonly fileName: string; readonly text: string }[]> {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
      files.add(file.replaceAll("\\", "/"));
    }
  }
  return Promise.all(
    [...files].sort().map(async (fileName) => ({
      fileName,
      text: await readFile(join(root, fileName), "utf8"),
    })),
  );
}

function conventionDescriptor(kind: string, id: string): object {
  return { [RELKIT_DESCRIPTOR]: true, kind, id, ref: { kind, id } };
}

function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
      (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code) ||
      left.severity.localeCompare(right.severity) ||
      left.message.localeCompare(right.message),
  );
}

async function assertJsonGolden(
  path: string,
  actual: string,
  run: FixtureCompilation,
): Promise<void> {
  const expected = await readFile(path, "utf8");
  const expectedBytes = `${canonicalJson(JSON.parse(expected))}\n`;
  if (expectedBytes === actual) return;
  if (process.env.UPDATE_GOLDEN === "1") {
    await writeFile(path, prettyJson(JSON.parse(actual)));
    return;
  }
  throw new Error(`${run.name}: ${path} does not match normalized compiler output.`);
}

async function assertTextGolden(
  path: string,
  actual: string,
  run: FixtureCompilation,
): Promise<void> {
  const expected = await readFile(path, "utf8");
  if (expected === actual) return;
  if (process.env.UPDATE_GOLDEN === "1") {
    await writeFile(path, actual);
    return;
  }
  throw new Error(`${run.name}: ${path} does not match compiler exit code.`);
}

async function assertGraphGolden(
  path: string,
  actual: string,
  run: FixtureCompilation,
): Promise<void> {
  const expected = await readFile(path, "utf8");
  const expectedBytes = `${canonicalGraphJson(JSON.parse(expected))}\n`;
  if (expectedBytes === actual) return;
  if (process.env.UPDATE_GOLDEN === "1") {
    await writeFile(path, prettyJson(JSON.parse(actual)));
    return;
  }
  throw new Error(`${run.name}: ${path} does not match normalized compiler graph output.`);
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
