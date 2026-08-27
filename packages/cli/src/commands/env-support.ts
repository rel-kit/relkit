import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EnvResolutionError,
  resolveEnv,
  type EnvDefinition,
  type EnvProjection,
  type EnvShape,
  type EnvSource,
} from "@relkit/config";
import {
  exampleValue,
  EnvCommandError,
  formatCheck,
  formatExplain,
  isRequired,
  parseEnvArgs,
  type EnvCommandOptions,
  type EnvStatus,
  type SafeEnvIssue,
} from "./env-format.js";

export {
  EnvCommandError,
  formatCheck,
  formatExplain,
  isRequired,
  parseEnvArgs,
} from "./env-format.js";
export type { EnvCommandOptions, EnvStatus, ParsedEnvArgs, SafeEnvIssue } from "./env-format.js";

export async function loadEnvDefinition(
  options: Pick<EnvCommandOptions, "definition" | "projectRoot" | "envPath">,
): Promise<EnvDefinition<EnvShape>> {
  if (options.definition !== undefined) return options.definition;
  const root = resolve(options.projectRoot ?? process.cwd());
  const path = resolve(root, options.envPath ?? join("src", "env.ts"));
  if (!inside(root, path))
    throw new EnvCommandError(
      "RELKIT_ENV_USAGE",
      "Environment path must remain inside the project root.",
    );
  let loaded: unknown;
  try {
    loaded = await import(`${pathToFileURL(path).href}?relkit_env=1`);
  } catch {
    throw new EnvCommandError(
      "RELKIT_ENV_NOT_FOUND",
      `Environment contract was not found at ${relative(root, path)}.`,
    );
  }
  const module = loaded as { readonly default?: unknown; readonly env?: unknown };
  const value = module.default ?? module.env ?? loaded;
  const definition =
    isRecord(value) && value.kind === "env-definition"
      ? value
      : isRecord(value)
        ? value.env
        : undefined;
  if (!isRecord(definition) || definition.kind !== "env-definition")
    throw new EnvCommandError(
      "RELKIT_ENV_INVALID",
      "The environment module does not export an environment definition.",
    );
  return definition as EnvDefinition<EnvShape>;
}

export async function createExample(
  fields: readonly EnvProjection[],
  options: Pick<EnvCommandOptions, "projectRoot" | "examplePath">,
  write: boolean,
) {
  const content = `${fields.map((field) => `${field.name}=${exampleValue(field)}`).join("\n")}\n`;
  const root = resolve(options.projectRoot ?? process.cwd());
  const path = resolve(root, options.examplePath ?? ".env.example");
  if (!inside(root, path))
    throw new EnvCommandError(
      "RELKIT_ENV_USAGE",
      "Example path must remain inside the project root.",
    );
  let existing = false;
  try {
    await readFile(path);
    existing = true;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (write) await writeFile(path, content, "utf8");
  return {
    ok: true as const,
    command: "example" as const,
    path,
    existing,
    written: write,
    content,
  };
}

export function resolveStatus(
  definition: EnvDefinition<EnvShape>,
  fields: readonly EnvProjection[],
  environment: string,
  source: EnvSource,
) {
  const issues: readonly SafeEnvIssue[] = (() => {
    try {
      resolveEnv(definition, { environment, source });
      return [];
    } catch (error) {
      if (!(error instanceof EnvResolutionError)) throw error;
      return error.issues.map(({ name, code, sensitive }) => ({
        name,
        code,
        sensitive,
        message: code === "missing" ? "Required value is missing" : "Value is invalid",
      }));
    }
  })();
  const issueByName = new Map(issues.map((issue) => [issue.name, issue]));
  const items = fields.map((field) => {
    const issue = issueByName.get(field.name);
    const supplied = Object.hasOwn(source, field.name) && source[field.name] !== undefined;
    const status: EnvStatus =
      issue?.code === "invalid"
        ? "invalid"
        : issue?.code === "missing"
          ? "missing"
          : supplied
            ? "set"
            : field.hasDefault
              ? "default"
              : "optional";
    return { name: field.name, status };
  });
  return { ok: issues.length === 0, items, issues };
}

function inside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}
function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
