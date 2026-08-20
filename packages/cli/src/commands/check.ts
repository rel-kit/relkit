import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "@zsys/contracts";
import {
  checkConventions,
  evaluateCandidates,
  extractDescriptors,
  loadConfig,
  normalizeCompilation,
  prefilterSources,
  typecheckProject,
  writeGeneratedArtifacts,
  type GeneratedOutputs,
  type LoadedToolingConfig,
} from "@zsys/compiler";
import { createDiagnostic, sortDiagnostics, type Diagnostic } from "@zsys/diagnostics";
import { writeEventRegistry } from "./check-event-registry.js";
import {
  checkFailureDiagnostics,
  conventionDescriptor,
  emptyCheckOutputs,
  evaluatorDiagnostics,
  isInside,
  safeMessage,
  throwIfAborted,
} from "./check-support.js";
export interface CheckOptions {
  readonly projectRoot?: string;
  readonly configPath?: string;
  readonly config?: unknown;
  readonly generationId?: string;
  readonly timeoutMs?: number;
  readonly environmentAllowlist?: readonly string[];
  readonly networkAllowlist?: readonly string[];
  readonly signal?: AbortSignal;
  readonly mode?: "development" | "test" | "production";
}
export interface CheckResult {
  readonly ok: boolean;
  readonly activatable: boolean;
  readonly projectRoot: string;
  readonly generatedDirectory: string;
  readonly graphHash?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly outputs: GeneratedOutputs;
  readonly config?: LoadedToolingConfig;
}
let checkSequence = 0;
/** Compiles one project and writes only deterministic, content-aware artifacts. */
export async function checkProject(options: CheckOptions = {}): Promise<CheckResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const generatedDirectory = join(projectRoot, ".zsys", "generated");
  try {
    throwIfAborted(options.signal);
    const input = await readConfig(projectRoot, options);
    const config = loadConfig(input, projectRoot);
    const outputDirectory = join(projectRoot, config.generatedDirectory);
    const sources = await readSources(projectRoot, config.source);
    const prefiltered = prefilterSources(sources, { projectRoot, exclude: config.exclude });
    const evaluator = await evaluateCandidates({
      projectRoot,
      candidates: prefiltered.candidates.map(({ fileName }) => fileName),
      generationId: options.generationId ?? `cli-check-${++checkSequence}`,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.environmentAllowlist === undefined
        ? {}
        : { environmentAllowlist: options.environmentAllowlist }),
      ...(options.networkAllowlist === undefined
        ? {}
        : { networkAllowlist: options.networkAllowlist }),
      generatedDirectory: config.generatedDirectory,
      sourceMaps: true,
    });
    if (evaluator.status !== "ok") {
      return emitResult(projectRoot, outputDirectory, evaluatorDiagnostics(evaluator.failures));
    }
    throwIfAborted(options.signal);
    const extracted = extractDescriptors(evaluator, { projectRoot, sources });
    await writeEventRegistry(extracted, projectRoot, config.generatedDirectory);
    const typeDiagnostics = typecheckProject(projectRoot);
    const normalization = normalizeCompilation({
      evaluator,
      projectRoot,
      sources,
      mode: options.mode ?? "development",
    });
    const diagnostics = sortDiagnostics([
      ...typeDiagnostics,
      ...normalization.diagnostics,
      ...extracted.flatMap((entry) =>
        checkConventions({
          descriptor: conventionDescriptor(entry.descriptor.kind, entry.descriptor.id),
          sourcePath: entry.reference.module,
          projectRoot,
          location: entry.source,
          exportKind: entry.exportKind,
        }),
      ),
    ]);
    const outputs = {
      ...normalization.outputs,
      diagnostics: `${canonicalJson(diagnostics)}\n`,
      manifest: normalization.activatable ? normalization.outputs.manifest : "",
    } satisfies GeneratedOutputs;
    return emitResult(
      projectRoot,
      outputDirectory,
      diagnostics,
      outputs,
      normalization.graphHash,
      config,
    );
  } catch (error) {
    return emitResult(
      projectRoot,
      generatedDirectory,
      await checkFailureDiagnostics(
        error,
        projectRoot,
        resolve(projectRoot, options.configPath ?? "zsys.config.ts"),
      ),
    );
  }
}
export const runCheck = checkProject;
async function readConfig(projectRoot: string, options: CheckOptions): Promise<unknown> {
  if (options.config !== undefined) return options.config;
  const configPath = resolve(projectRoot, options.configPath ?? "zsys.config.ts");
  if (!isInside(projectRoot, configPath))
    throw new Error("Config path must remain inside project root.");
  if (!existsSync(configPath)) throw new Error("zsys.config.ts was not found.");
  const query = options.generationId ?? `cli-check-${++checkSequence}`;
  const loaded = (await import(
    `${pathToFileURL(configPath).href}?zsys_check=${encodeURIComponent(query)}`
  )) as {
    readonly default?: unknown;
  };
  return loaded.default ?? loaded;
}
async function readSources(
  projectRoot: string,
  patterns: readonly string[],
): Promise<readonly { readonly fileName: string; readonly text: string }[]> {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: projectRoot, onlyFiles: true }))
      files.add(file.replaceAll("\\", "/"));
  }
  return Promise.all(
    [...files].sort().map(async (fileName) => ({
      fileName,
      text: await readFile(join(projectRoot, fileName), "utf8"),
    })),
  );
}
async function emitResult(
  projectRoot: string,
  generatedDirectory: string,
  diagnostics: readonly Diagnostic[],
  outputs: GeneratedOutputs = emptyCheckOutputs(diagnostics),
  graphHash?: string,
  config?: LoadedToolingConfig,
): Promise<CheckResult> {
  let stable = sortDiagnostics(diagnostics);
  let nextOutputs =
    outputs.diagnostics === ""
      ? { ...outputs, diagnostics: `${canonicalJson(stable)}\n` }
      : outputs;
  try {
    await writeGeneratedArtifacts(nextOutputs, { directory: generatedDirectory });
  } catch (error) {
    stable = sortDiagnostics([
      ...stable,
      createDiagnostic({
        code: "ZSYS_ARTIFACT_WRITE_FAILED",
        severity: "error",
        message: safeMessage(error, projectRoot),
      }),
    ]);
    nextOutputs = { ...nextOutputs, diagnostics: `${canonicalJson(stable)}\n` };
  }
  const hasErrors = stable.some((diagnostic) => diagnostic.severity === "error");
  return Object.freeze({
    ok: !hasErrors,
    activatable: !hasErrors && nextOutputs.manifest !== "",
    projectRoot,
    generatedDirectory,
    ...(graphHash === undefined ? {} : { graphHash }),
    ...(config === undefined ? {} : { config }),
    diagnostics: Object.freeze(stable),
    outputs: nextOutputs,
  });
}
