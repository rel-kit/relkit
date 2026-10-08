import { Effect } from "effect";
import {
  EnvResolutionError,
  resolveEnv,
  resolveEnvEffect,
  type EnvDefinition,
  type EnvProjection,
  type EnvShape,
  type EnvSource,
} from "@relkit/config";
import { cliAdapterError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliEnvironmentProject, environmentProjectLayer } from "./env-project.service.js";
import type { EnvCommandOptions, EnvStatus, SafeEnvIssue } from "./env.types.js";

export {
  EnvCommandError,
  formatCheck,
  formatExplain,
  isRequired,
  parseEnvArgs,
} from "./env-format.js";
export type { EnvCommandOptions, EnvStatus, ParsedEnvArgs, SafeEnvIssue } from "./env.types.js";

/**
 * Loads an opaque environment declaration through caller-provided capabilities.
 * @param options - Definition injection or contained module path.
 * @returns A lazy declaration requiring CliEnvironmentProject.
 */
export const loadEnvDefinitionEffect = Effect.fn("Environment.load")(
  (options: Pick<EnvCommandOptions, "definition" | "projectRoot" | "envPath">) =>
    CliEnvironmentProject.use((project) => project.load(options)),
);

/**
 * Preserves the public opaque declaration-loading Promise boundary.
 * @param options - Definition injection or contained module path.
 * @returns Owner declaration retaining callback and object identity.
 */
export function loadEnvDefinition(
  options: Pick<EnvCommandOptions, "definition" | "projectRoot" | "envPath">,
): Promise<EnvDefinition<EnvShape>> {
  return runCliEffect(loadEnvDefinitionEffect(options), environmentProjectLayer);
}

/**
 * Produces an example through caller-supplied project authority.
 * @param fields - Value-free field metadata.
 * @param options - Project root and example path.
 * @param write - Explicit write authorization.
 * @returns Lazy safe example output.
 */
export const createExampleEffect = Effect.fn("Environment.example")(
  (
    fields: readonly EnvProjection[],
    options: Pick<EnvCommandOptions, "projectRoot" | "examplePath">,
    write: boolean,
  ) => CliEnvironmentProject.use((project) => project.example(fields, options, write)),
);

/**
 * Preserves the example Promise boundary and existing overwrite policy.
 * @param fields - Value-free field metadata.
 * @param options - Project root and example path.
 * @param write - Explicit write authorization.
 * @returns Safe example output after any write settles.
 */
export function createExample(
  fields: readonly EnvProjection[],
  options: Pick<EnvCommandOptions, "projectRoot" | "examplePath">,
  write: boolean,
) {
  return runCliEffect(createExampleEffect(fields, options, write), environmentProjectLayer);
}

/**
 * Preserves the synchronous secret-free environment status projection.
 * @typeParam Shape - The config owner's concrete declaration shape.
 * @param definition - Opaque config-owner declaration.
 * @param fields - Value-free field metadata.
 * @param environment - Selected environment name.
 * @param source - Explicit raw values, excluded from output.
 * @returns Safe statuses and redacted issue messages.
 * @throws The config owner's existing error for malformed input.
 */
export function resolveStatus<Shape extends EnvShape>(
  definition: EnvDefinition<Shape>,
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
  return statusProjection(fields, source, issues);
}

/**
 * Resolves values through the config owner's native Effect without retaining them.
 * @typeParam Shape - The config owner's concrete declaration shape.
 * @param definition - Opaque owner declaration.
 * @param fields - Value-free metadata.
 * @param environment - Selected environment name.
 * @param source - Raw source, excluded from all output and telemetry.
 * @returns Lazy redacted statuses; malformed declarations retain their TypeError boundary.
 */
export const resolveStatusEffect = Effect.fn("Environment.status")(
  function* <Shape extends EnvShape>(
    definition: EnvDefinition<Shape>,
    fields: readonly EnvProjection[],
    environment: string,
    source: EnvSource,
  ) {
    const issues = yield* resolveEnvEffect(definition, { environment, source }).pipe(
      Effect.as<readonly SafeEnvIssue[]>([]),
      Effect.catchTag("EnvResolutionError", (error) =>
        Effect.succeed(
          error.issues.map(({ name, code, sensitive }) => ({
            name,
            code,
            sensitive,
            message: code === "missing" ? "Required value is missing" : "Value is invalid",
          })),
        ),
      ),
      Effect.mapError((error) =>
        cliAdapterError(
          "env.status",
          error.syntax ? new SyntaxError(error.message) : new TypeError(error.message),
        ),
      ),
    );
    return statusProjection(fields, source, issues);
  },
  (effect) => observeCli("env.status", effect),
);

/**
 * Projects safe field status without returning parsed or default values.
 * @param fields - Declaration metadata.
 * @param source - Raw source used only to determine presence.
 * @param issues - Already redacted owner failures.
 * @returns Safe field statuses and issues.
 */
function statusProjection(
  fields: readonly EnvProjection[],
  source: EnvSource,
  issues: readonly SafeEnvIssue[],
) {
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
