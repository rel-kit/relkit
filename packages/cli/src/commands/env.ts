import {
  createExample,
  createExampleEffect,
  EnvCommandError,
  formatCheck,
  formatExplain,
  loadEnvDefinition,
  loadEnvDefinitionEffect,
  parseEnvArgs,
  resolveStatus,
  resolveStatusEffect,
  isRequired,
  type EnvCommandOptions,
} from "./env-support.js";
import { projectEnvEffect } from "@relkit/config";
import { Effect } from "effect";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { environmentProjectLayer } from "./env-project.service.js";
import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";

export {
  createExample,
  EnvCommandError,
  formatCheck,
  formatExplain,
  loadEnvDefinition,
  parseEnvArgs,
  resolveStatus,
  isRequired,
};
export type { EnvCommandOptions } from "./env-support.js";

/**
 * Runs environment commands through the established reporter and exit boundary.
 * @param args - Subcommand and flags.
 * @param context - Existing output policy.
 * @param options - Injected definition, explicit source, and path overrides.
 * @returns Existing success, failure, or usage status with values excluded from output.
 */
export async function runEnv(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
  options: EnvCommandOptions = {},
): Promise<number> {
  try {
    return await runCliEffect(runEnvEffect(args, context, options), environmentProjectLayer);
  } catch (error) {
    const code = error instanceof EnvCommandError ? error.code : "RELKIT_ENV_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_ENV_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}

/**
 * Composes environment operations lazily within the caller's service graph.
 * @param args - Subcommand and flags.
 * @param context - Reporter receiving the unchanged public result shapes.
 * @param options - Explicit declaration/source injection and path settings.
 * @returns Lazy exit status requiring CliEnvironmentProject.
 */
export const runEnvEffect = Effect.fn("Environment.command")(
  function* (
    args: readonly string[],
    context: Pick<CliCommandContext, "json" | "reporter">,
    options: EnvCommandOptions = {},
  ) {
    const parsed = yield* cliTry("env.args", () => parseEnvArgs(args));
    const settings = {
      ...options,
      ...(parsed.projectRoot === undefined ? {} : { projectRoot: parsed.projectRoot }),
      ...(parsed.environment === undefined ? {} : { environment: parsed.environment }),
      ...(parsed.examplePath === undefined ? {} : { examplePath: parsed.examplePath }),
    };
    const definition = yield* loadEnvDefinitionEffect(settings);
    const environment = settings.environment ?? process.env.NODE_ENV ?? "development";
    const source = settings.source ?? process.env;
    const fields = yield* projectEnvEffect(definition).pipe(
      Effect.mapError((error) =>
        cliAdapterError(
          "env.project",
          error.syntax ? new SyntaxError(error.message) : new TypeError(error.message),
        ),
      ),
    );

    if (parsed.command === "example") {
      const result = yield* createExampleEffect(fields, settings, parsed.write);
      context.reporter.output(result, result.content);
      return CLI_EXIT_CODES.success;
    }

    const resolution = yield* resolveStatusEffect(definition, fields, environment, source);
    if (parsed.command === "check") {
      const result = {
        ok: resolution.ok,
        command: "check" as const,
        environment,
        items: resolution.items,
        issues: resolution.issues,
      };
      context.reporter.output(result, formatCheck(result));
      return resolution.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    if (parsed.command === "list") {
      const result = {
        ok: true as const,
        command: "list" as const,
        environment,
        items: resolution.items,
      };
      context.reporter.output(
        result,
        result.items.map((item) => `${item.name}: ${item.status}`).join("\n"),
      );
      return CLI_EXIT_CODES.success;
    }

    const field = fields.find(({ name }) => name === parsed.name);
    if (field === undefined)
      return yield* Effect.fail(
        cliAdapterError(
          "env.explain",
          new EnvCommandError("RELKIT_ENV_UNKNOWN", `Unknown environment variable: ${parsed.name}`),
        ),
      );
    const result = {
      ok: true as const,
      command: "explain" as const,
      environment,
      name: field.name,
      type: field.type,
      requiredIn: field.requiredIn,
      required: isRequired(field, environment),
      hasDefault: field.hasDefault,
      optional: field.optional,
      sensitive: field.sensitive,
      ...(field.description === undefined ? {} : { description: field.description }),
    };
    context.reporter.output(result, formatExplain(result));
    return CLI_EXIT_CODES.success;
  },
  (effect) => observeCli("env.command", effect),
);
