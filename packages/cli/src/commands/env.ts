import {
  createExample,
  EnvCommandError,
  formatCheck,
  formatExplain,
  loadEnvDefinition,
  parseEnvArgs,
  resolveStatus,
  isRequired,
  type EnvCommandOptions,
} from "./env-support.js";
import { projectEnv } from "@relkit/config";
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

/** Runs the secret-safe environment command family through the shared reporter. */
export async function runEnv(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
  options: EnvCommandOptions = {},
): Promise<number> {
  try {
    const parsed = parseEnvArgs(args);
    const settings = {
      ...options,
      ...(parsed.projectRoot === undefined ? {} : { projectRoot: parsed.projectRoot }),
      ...(parsed.environment === undefined ? {} : { environment: parsed.environment }),
      ...(parsed.examplePath === undefined ? {} : { examplePath: parsed.examplePath }),
    };
    const definition = await loadEnvDefinition(settings);
    const environment = settings.environment ?? process.env.NODE_ENV ?? "development";
    const source = settings.source ?? process.env;
    const fields = projectEnv(definition);

    if (parsed.command === "example") {
      const result = await createExample(fields, settings, parsed.write);
      context.reporter.output(result, result.content);
      return CLI_EXIT_CODES.success;
    }

    const resolution = resolveStatus(definition, fields, environment, source);
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
      throw new EnvCommandError(
        "RELKIT_ENV_UNKNOWN",
        `Unknown environment variable: ${parsed.name}`,
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
  } catch (error) {
    const code = error instanceof EnvCommandError ? error.code : "RELKIT_ENV_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_ENV_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}
