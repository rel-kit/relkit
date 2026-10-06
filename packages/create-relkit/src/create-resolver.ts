import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { normalizeCreateOptions, type CreateOptions } from "./options.js";
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
 * Resolves explicit flags and the minimal starter default, asking only a missing project name.
 * @param args - Existing create argument vector.
 * @param context - Existing JSON and interactivity settings.
 * @returns Options retaining undefined jobs/directory and whether name input was prompted.
 * @remarks Generation owns final consent; infrastructure and template choices use explicit flags.
 */
export const resolveCreateOptionsDetailsEffect = Effect.fn("CreateResolution.resolve")(
  function* (args: readonly string[], context: ResolveCreateContext = {}) {
    const output = [...args];
    let prompted = false;
    if (context.interactive === true && !positional(output)) {
      const name = yield* (yield* GeneratorPrompt).text({
        message: "Project name",
        validate: (value) =>
          isValidPackageName(value) ? undefined : "Use a valid npm package name.",
      });
      output.unshift(name);
      prompted = true;
    }
    const options = yield* domainTry(() =>
      normalizeCreateOptions(output, context.json === undefined ? {} : { json: context.json }),
    );
    return { options, prompted };
  },
  (effect) => observeExecution("generator", "create.resolve", effect),
);

/**
 * Preserves normalized creation's Promise compatibility API.
 * @param args - Existing flags.
 * @param context - Existing prompt settings.
 * @returns The minimal-default options or explicit advanced choices.
 */
export async function resolveCreateOptions(
  args: readonly string[],
  context: ResolveCreateContext = {},
): Promise<CreateOptions> {
  return (await resolveCreateOptionsDetails(args, context)).options;
}

/**
 * Preserves detailed creation resolution while reducing setup questions to missing name input.
 * @param args - Existing flags.
 * @param context - Existing prompt settings.
 * @returns Options and whether name input was requested.
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
