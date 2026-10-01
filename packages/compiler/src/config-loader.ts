import { Data, Effect, Schema } from "effect";
import type { ParsedConfig } from "./config-loader.types.js";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import {
  CONFIG_CODES,
  DEFAULT_TOOLING_CONFIG,
  type ConfigIssue,
  type ConfigLoaderOptions,
  type LoadedToolingConfig,
} from "./config-loader-types.js";
import {
  allowedKeys,
  errorMessage,
  freezeIssues,
  isAbsolute,
  posixNormalize,
  readRecord,
  unwrapDefault,
} from "./config-loader-utils.js";
import { readInspector, readServer } from "./config-loader-runtime.js";
import { readDeployment } from "./config-loader-deployment.js";

const ParsedConfig = Data.taggedEnum<ParsedConfig>();

export { CONFIG_CODES, DEFAULT_CONFIG, DEFAULT_TOOLING_CONFIG } from "./config-loader-types.js";
export type {
  ConfigIssue,
  ConfigIssueCode,
  ConfigLoaderOptions,
  InspectorConfig,
  InspectorConfigInput,
  LoadedToolingConfig,
  ToolingConfigInput,
  RelkitConfig,
} from "./config-loader-types.js";

/** Legacy thrown configuration error with immutable validation evidence. */
export class ConfigValidationError extends TypeError {
  readonly name = "ConfigValidationError";
  readonly issues: readonly ConfigIssue[];

  /**
   * Copies issues before constructing the public exception message.
   * @param issues - Ordered configuration validation evidence.
   */
  constructor(issues: readonly ConfigIssue[]) {
    const normalized = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(`Invalid relkit.config.ts: ${normalized.map((issue) => issue.message).join("; ")}`);
    this.issues = normalized;
  }
}

/** Expected tooling configuration rejection, retaining the legacy exception for adapters. */
export class CompilerConfigError extends Schema.TaggedError<CompilerConfigError>()(
  "CompilerConfigError",
  { cause: Schema.Defect() },
) {}

/** Expected nonabsolute project root; property access and conversion defects still propagate. */
export class ProjectRootError extends Schema.TaggedError<ProjectRootError>()("ProjectRootError", {
  cause: Schema.Defect(),
}) {}

/**
 * Normalizes an absolute project root while retaining UNC path semantics.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A lazy effect that normalizes an absolute project root while retaining UNC path semantics; unexpected access failures remain defects.
 * @remarks Nonabsolute roots fail with ProjectRootError; no services are required.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const normalizeProjectRootEffect = Effect.fn("Compiler.normalizeProjectRoot")(
  function* (projectRoot = process.cwd()) {
    const value = projectRoot.replaceAll("\\", "/").trim();
    if (!isAbsolute(value))
      return yield* new ProjectRootError({
        cause: new TypeError("Project root must be an absolute path"),
      });
    const unc = value.startsWith("//");
    const normalized = posixNormalize(unc ? `/${value.slice(2)}` : value);
    return unc ? `//${normalized.replace(/^\/+/, "")}` : normalized;
  },
  (effect, projectRoot?: string) =>
    observeCompiler("configuration", "normalizeProjectRoot", effect, () => ({})),
);

/**
 * Normalizes an absolute project root while retaining UNC path semantics.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns The absolute project root with portable separators and preserved UNC semantics.
 */
export function normalizeProjectRoot(projectRoot = process.cwd()): string {
  return runCompilerSync(
    normalizeProjectRootEffect(projectRoot).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Collects ordered tooling configuration issues without loading application behavior.
 * @param input - Untrusted tooling configuration or default-exported module contents.
 * @param options - Project root or configuration loading options.
 * @returns A lazy effect that collects ordered tooling configuration issues without loading application behavior; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const validateConfigEffect = Effect.fn("Compiler.validateConfig")(
  function* (input: unknown, options: ConfigLoaderOptions | string = {}) {
    return (yield* parseConfigEffect(input, options)).issues;
  },
  (effect, input, options: ConfigLoaderOptions | string = {}) =>
    observeCompiler("configuration", "validateConfig", effect, () => ({})),
);

/**
 * Collects ordered tooling configuration issues without loading application behavior.
 * @param input - Untrusted tooling configuration or default-exported module contents.
 * @param options - Project root or configuration loading options.
 * @returns Ordered configuration issues without importing application behavior.
 */
export function validateConfig(
  input: unknown,
  options: ConfigLoaderOptions | string = {},
): readonly ConfigIssue[] {
  return runCompilerSync(validateConfigEffect(input, options));
}

/**
 * Validates tooling configuration and applies immutable default settings.
 * @param input - Untrusted tooling configuration or default-exported module contents.
 * @param options - Project root or configuration loading options.
 * @returns A lazy effect that validates tooling configuration and applies immutable default settings; unexpected access failures remain defects.
 * @remarks Invalid settings fail with CompilerConfigError. No application code is imported.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { loadConfigEffect } from "./config-loader.js";
 * const config = Effect.runSync(loadConfigEffect({}, { projectRoot: process.cwd() }));
 * ```
 */
export const loadConfigEffect = Effect.fn("Compiler.loadConfig")(
  function* (input: unknown = {}, options: ConfigLoaderOptions | string = {}) {
    const parsed = yield* parseConfigEffect(input, options);
    if (parsed._tag === "Rejected")
      return yield* new CompilerConfigError({ cause: new ConfigValidationError(parsed.issues) });
    return parsed.config;
  },
  (effect, input: unknown = {}, options: ConfigLoaderOptions | string = {}) =>
    observeCompiler("configuration", "loadConfig", effect, () => ({})),
);

/**
 * Validates tooling configuration and applies immutable default settings.
 * @param input - Untrusted tooling configuration or default-exported module contents.
 * @param options - Project root or configuration loading options.
 * @returns Validated immutable tooling configuration with defaults applied.
 */
export function loadConfig(
  input: unknown = {},
  options: ConfigLoaderOptions | string = {},
): LoadedToolingConfig {
  return runCompilerSync(
    loadConfigEffect(input, options).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Parses tooling configuration while retaining all recoverable validation issues.
 * @param input - Untrusted tooling configuration or default-exported module contents.
 * @param options - Project root or configuration loading options.
 * @returns A lazy effect that parses tooling configuration while retaining all recoverable validation issues; unexpected access failures remain defects.
 */
const parseConfigEffect = Effect.fn("Compiler.parseConfig")(function* (
  input: unknown,
  options: ConfigLoaderOptions | string,
): Effect.fn.Return<ParsedConfig> {
  const issues: ConfigIssue[] = [];
  const root = yield* normalizeProjectRootEffect(
    typeof options === "string" ? options : options.projectRoot,
  ).pipe(
    Effect.catchTag("ProjectRootError", (error) =>
      Effect.sync(() => {
        issues.push({
          code: CONFIG_CODES.root,
          path: "projectRoot",
          message: errorMessage(error.cause),
        });
        return undefined;
      }),
    ),
  );
  if (root === undefined) {
    return ParsedConfig.Rejected({ issues: freezeIssues(issues) });
  }
  const record = readRecord(unwrapDefault(input), "$", issues);
  if (record === undefined) return ParsedConfig.Rejected({ issues: freezeIssues(issues) });
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      const migration = legacyMigration(key);
      const behavior = typeof record[key] === "function";
      issues.push({
        code:
          migration === undefined
            ? behavior
              ? CONFIG_CODES.behavior
              : CONFIG_CODES.key
            : CONFIG_CODES.legacy,
        path: key,
        message:
          migration ??
          (behavior
            ? `Application behavior is not allowed in tooling config at "${key}".`
            : `Unknown tooling config key "${key}".`),
      });
    }
  }
  const server = readServer(record.server, issues);
  const inspector = readInspector(record.inspector, issues);
  const deployment = readDeployment(record.deployment, issues);
  if (issues.length > 0) return ParsedConfig.Rejected({ issues: freezeIssues(issues) });
  return ParsedConfig.Accepted({
    config: Object.freeze({
      projectRoot: root,
      source: DEFAULT_TOOLING_CONFIG.source,
      exclude: DEFAULT_TOOLING_CONFIG.exclude,
      generatedDirectory: DEFAULT_TOOLING_CONFIG.generatedDirectory,
      server: Object.freeze({ ...server, apiDocs: Object.freeze(server.apiDocs) }),
      inspector: Object.freeze(inspector),
      ...(deployment === undefined ? {} : { deployment }),
    }),
    issues: Object.freeze([]),
  });
});

/**
 * Selects an actionable migration message for a removed tooling key.
 * @param key - Property or stable lookup key.
 * @returns The removed key's migration guidance, or undefined.
 */
function legacyMigration(key: string): string | undefined {
  return (
    {
      entry: 'Remove "entry"; RELKIT discovers descriptors from "src/**/*.ts".',
      source: 'Remove "source"; RELKIT always discovers "src/**/*.ts".',
      exclude:
        'Remove "exclude"; tests, fixtures, declarations, and generated content are excluded by convention.',
      generatedDirectory:
        'Remove "generatedDirectory"; generated output is always ".relkit/generated".',
    } as Record<string, string>
  )[key];
}
