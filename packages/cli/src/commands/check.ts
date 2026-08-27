import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, normalizeId } from "@relkit/contracts";
import {
  checkConventions,
  evaluateCandidates,
  extractDescriptors,
  loadConfig,
  normalizeCompilation,
  prefilterSources,
  typecheckProject,
  type GeneratedOutputs,
} from "@relkit/compiler";
import { sortDiagnostics } from "@relkit/diagnostics";
import { writeEventRegistry } from "./check-event-registry.js";
import { writeContextRegistry } from "./check-context-registry.js";
import { emitCheckResult, type CheckResult } from "./check-result.js";
import {
  checkFailureDiagnostics,
  conventionDescriptor,
  evaluatorDiagnostics,
  isInside,
  throwIfAborted,
} from "./check-support.js";
export type { CheckResult } from "./check-result.js";
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
let checkSequence = 0;
/** Compiles one project and writes only deterministic, content-aware artifacts. */
export async function checkProject(options: CheckOptions = {}): Promise<CheckResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const generatedDirectory = join(projectRoot, ".relkit", "generated");
  try {
    throwIfAborted(options.signal);
    const input = await readConfig(projectRoot, options);
    const config = loadConfig(input, projectRoot);
    const outputDirectory = join(projectRoot, config.generatedDirectory);
    const sources = await readSources(projectRoot, config.source);
    const configPath = resolve(projectRoot, options.configPath ?? "relkit.config.ts");
    const configSource = relative(projectRoot, configPath).replaceAll("\\", "/");
    const discoverySources = [
      ...sources.filter((source) => source.fileName !== configSource),
      { fileName: configSource, text: await readFile(configPath, "utf8") },
    ];
    const prefiltered = prefilterSources(discoverySources, {
      projectRoot,
      exclude: config.exclude,
    });
    const generationId = options.generationId ?? `cli-check-${++checkSequence}`;
    const evaluator = await evaluateCandidates({
      projectRoot,
      candidates: prefiltered.candidates,
      generationId,
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
      return emitCheckResult(
        projectRoot,
        outputDirectory,
        evaluatorDiagnostics(evaluator.failures),
      );
    }
    throwIfAborted(options.signal);
    const extracted = extractDescriptors(evaluator, { projectRoot, sources: discoverySources });
    await Promise.all([
      writeEventRegistry(extracted, projectRoot, config.generatedDirectory),
      writeContextRegistry(extracted, projectRoot, config.generatedDirectory),
    ]);
    const typeDiagnostics = typecheckProject(projectRoot);
    const normalization = normalizeCompilation({
      evaluator,
      projectRoot,
      sources: discoverySources,
      appId: await packageApplicationId(projectRoot),
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
    return emitCheckResult(
      projectRoot,
      outputDirectory,
      diagnostics,
      outputs,
      normalization.graphHash,
      config,
    );
  } catch (error) {
    return emitCheckResult(
      projectRoot,
      generatedDirectory,
      await checkFailureDiagnostics(
        error,
        projectRoot,
        resolve(projectRoot, options.configPath ?? "relkit.config.ts"),
      ),
    );
  }
}

async function packageApplicationId(projectRoot: string): Promise<string> {
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
    readonly name?: unknown;
  };
  if (typeof packageJson.name !== "string") {
    throw new TypeError("package.json.name is required when config.id is omitted");
  }
  const name = packageJson.name.startsWith("@") ? packageJson.name.slice(1) : packageJson.name;
  return normalizeId(name.replaceAll("/", "."));
}
export const runCheck = checkProject;
async function readConfig(projectRoot: string, options: CheckOptions): Promise<unknown> {
  if (options.config !== undefined) return options.config;
  const configPath = resolve(projectRoot, options.configPath ?? "relkit.config.ts");
  if (!isInside(projectRoot, configPath))
    throw new Error("Config path must remain inside project root.");
  if (!existsSync(configPath)) throw new Error("relkit.config.ts was not found.");
  const query = options.generationId ?? `cli-check-${++checkSequence}`;
  const loaded = (await import(
    `${pathToFileURL(configPath).href}?relkit_check=${encodeURIComponent(query)}`
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
