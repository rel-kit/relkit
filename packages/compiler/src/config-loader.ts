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
  readInspector,
  readPath,
  readPaths,
  readRecord,
  unwrapDefault,
} from "./config-loader-utils.js";

export { CONFIG_CODES, DEFAULT_CONFIG, DEFAULT_TOOLING_CONFIG } from "./config-loader-types.js";
export type {
  ConfigIssue,
  ConfigIssueCode,
  ConfigLoaderOptions,
  InspectorConfig,
  InspectorConfigInput,
  LoadedToolingConfig,
  ToolingConfigInput,
  ZsysConfig,
} from "./config-loader-types.js";

export class ConfigValidationError extends TypeError {
  readonly name = "ConfigValidationError";
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const normalized = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(`Invalid zsys.config.ts: ${normalized.map((issue) => issue.message).join("; ")}`);
    this.issues = normalized;
  }
}

export function normalizeProjectRoot(projectRoot = process.cwd()): string {
  const value = projectRoot.replaceAll("\\", "/").trim();
  if (!isAbsolute(value)) throw new TypeError("Project root must be an absolute path");
  const unc = value.startsWith("//");
  const normalized = posixNormalize(unc ? `/${value.slice(2)}` : value);
  return unc ? `//${normalized.replace(/^\/+/, "")}` : normalized;
}

export function validateConfig(
  input: unknown,
  options: ConfigLoaderOptions | string = {},
): readonly ConfigIssue[] {
  return parseConfig(input, options).issues;
}

export function loadConfig(
  input: unknown = {},
  options: ConfigLoaderOptions | string = {},
): LoadedToolingConfig {
  const parsed = parseConfig(input, options);
  if (parsed.issues.length > 0) throw new ConfigValidationError(parsed.issues);
  return parsed.config!;
}

function parseConfig(
  input: unknown,
  options: ConfigLoaderOptions | string,
): {
  readonly config?: LoadedToolingConfig;
  readonly issues: readonly ConfigIssue[];
} {
  const issues: ConfigIssue[] = [];
  let root: string;
  try {
    root = normalizeProjectRoot(typeof options === "string" ? options : options.projectRoot);
  } catch (error) {
    issues.push({ code: CONFIG_CODES.root, path: "projectRoot", message: errorMessage(error) });
    return { issues: freezeIssues(issues) };
  }
  const record = readRecord(unwrapDefault(input), "$", issues);
  if (record === undefined) return { issues: freezeIssues(issues) };
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      const behavior = typeof record[key] === "function";
      issues.push({
        code: behavior ? CONFIG_CODES.behavior : CONFIG_CODES.key,
        path: key,
        message: behavior
          ? `Application behavior is not allowed in tooling config at "${key}".`
          : `Unknown tooling config key "${key}".`,
      });
    }
  }
  const entry = readPath(record.entry, "entry", DEFAULT_TOOLING_CONFIG.entry, root, false, issues);
  const source = readPaths(record.source, "source", DEFAULT_TOOLING_CONFIG.source, root, issues);
  const exclude = readPaths(
    record.exclude,
    "exclude",
    DEFAULT_TOOLING_CONFIG.exclude,
    root,
    issues,
  );
  const generatedDirectory = readPath(
    record.generatedDirectory,
    "generatedDirectory",
    DEFAULT_TOOLING_CONFIG.generatedDirectory,
    root,
    false,
    issues,
  );
  const inspector = readInspector(record.inspector, issues);
  if (issues.length > 0) return { issues: freezeIssues(issues) };
  return {
    config: Object.freeze({
      projectRoot: root,
      entry,
      source,
      exclude,
      generatedDirectory,
      inspector: Object.freeze(inspector),
    }),
    issues: Object.freeze([]),
  };
}
