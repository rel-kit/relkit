import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { CREATE_OPTION_DEFAULTS, normalizeCreateOptions, type CreateOptions } from "./options.js";
import { assertCreateCapability, supportedCreateTemplates } from "./create-capabilities.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import { GeneratorPrompt, generatorPromptLayer } from "./generator-prompt.js";
import { domainTry } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { isValidPackageName } from "./validate.js";
import type { ResolveCreateContext, ResolvedCreateOptions } from "./create-resolver.types.js";
export type { ResolveCreateContext, ResolvedCreateOptions } from "./create-resolver.types.js";

/**
 * Create flags whose values bypass interactive name resolution.
 */
const VALUE_OPTIONS = new Set(["template", "cloud", "deploy", "jobs", "directory"]);

/**
 * Resolves explicit flags and prompts for missing name, template, jobs and destination choices.
 * @param args - Existing create argument vector.
 * @param context - Existing JSON and interactivity settings.
 * @returns Options retaining undefined jobs when disabled and whether any choice was prompted.
 * @remarks Generation owns final consent; Git initialization defaults to enabled without a prompt.
 */
export const resolveCreateOptionsDetailsEffect = Effect.fn("CreateResolution.resolve")(
  function* (args: readonly string[], context: ResolveCreateContext = {}) {
    const output = [...args];
    let prompted = false;
    if (context.interactive === true) {
      const prompt = yield* GeneratorPrompt;
      let name = positional(output);
      if (!name) {
        name = yield* prompt.text({
          message: "Project name",
          validate: (value) =>
            isValidPackageName(value) ? undefined : "Use a valid npm package name.",
        });
        output.unshift(name);
        prompted = true;
      }
      if (!has(output, "template")) {
        const templates = supportedCreateTemplates(explicitCapabilityOptions(output));
        if (templates.length === 0)
          return yield* domainTry(() => {
            throw new Error("No certified starter template matches the explicit creation flags.");
          });
        const template = yield* prompt.select({
          message: "Starter template",
          options: templates.map((value) => ({ value, label: title(value) })),
          initialValue: CREATE_OPTION_DEFAULTS.template,
        });
        output.push("--template", template);
        prompted = true;
      }
      if (!has(output, "jobs")) {
        const jobs = yield* prompt.select({
          message: "Jobs service",
          options: [{ value: "none", label: "None" }],
          initialValue: "none",
        });
        if (jobs !== "none") output.push("--jobs", jobs);
        prompted = true;
      }
      if (!has(output, "directory")) {
        const directory = yield* prompt.text({
          message: "Destination",
          initialValue: name,
          validate: (value) => (value?.trim() ? undefined : "A destination is required."),
        });
        output.push("--directory", directory);
        prompted = true;
      }
    }
    const options = yield* domainTry(() =>
      normalizeCreateOptions(output, context.json === undefined ? {} : { json: context.json }),
    );
    yield* domainTry(() => assertCreateCapability(options));
    return { options, prompted };
  },
  (effect) => observeExecution("generator", "create.resolve", effect),
);

function explicitCapabilityOptions(args: readonly string[]) {
  return {
    cloud: explicitValue(args, "cloud") ?? CREATE_OPTION_DEFAULTS.cloud,
    deploy: explicitValue(args, "deploy") ?? CREATE_OPTION_DEFAULTS.deploy,
    ...(explicitValue(args, "jobs") === undefined
      ? {}
      : { jobs: explicitValue(args, "jobs") as CreateOptions["jobs"] }),
    examples: !args.includes("--no-examples"),
  };
}

function explicitValue(args: readonly string[], name: string): string | undefined {
  const flag = `--${name}`;
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  if (inline !== undefined) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

/**
 * Preserves normalized creation's Promise compatibility API.
 * @param args - Existing flags.
 * @param context - Existing prompt settings.
 * @returns Explicit or prompted choices with the existing defaults for other settings.
 */
export async function resolveCreateOptions(
  args: readonly string[],
  context: ResolveCreateContext = {},
): Promise<CreateOptions> {
  return (await resolveCreateOptionsDetails(args, context)).options;
}

/**
 * Preserves detailed creation resolution with the shared interactive choices.
 * @param args - Existing flags.
 * @param context - Existing prompt settings.
 * @returns Options and whether any creation choice was requested.
 */
export function resolveCreateOptionsDetails(
  args: readonly string[],
  context: ResolveCreateContext = {},
): Promise<ResolvedCreateOptions> {
  return runGeneratorPromise(
    resolveCreateOptionsDetailsEffect(args, context).pipe(
      Effect.provide(
        generatorPromptLayer(
          context.promptDriver ?? createClackPromptDriver("RELKIT_CREATE_CANCELLED"),
        ),
      ),
    ),
    context.signal,
  );
}

/**
 * Selects only the positional name while skipping values owned by explicit options.
 * @param args - Literal flag and positional arguments.
 * @returns The first project-name argument, or undefined when all tokens are flags or flag values.
 */
function positional(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === undefined) continue;
    if (value.startsWith("--")) {
      const name = value.slice(2).split("=", 1)[0];
      if (!value.includes("=") && name !== undefined && VALUE_OPTIONS.has(name)) index += 1;
    } else return value;
  }
  return undefined;
}

/**
 * Checks both separate and inline spellings of an explicit creation option.
 * @param args - Literal flag and positional arguments.
 * @param name - Supported flag name without its leading dashes.
 * @returns Whether the caller already supplied this choice.
 */
function has(args: readonly string[], name: string): boolean {
  return args.some((value) => value === `--${name}` || value.startsWith(`--${name}=`));
}

/**
 * Formats a declared template or jobs provider for its native selection label.
 * @param value - Supported choice value.
 * @returns A readable label retaining the Docker provider distinction.
 */
function title(value: string): string {
  return value
    .replace("effect-mq", "Effect MQ")
    .replace(/-docker$/u, " (Docker)")
    .replace(/^./u, (character) => character.toUpperCase());
}
