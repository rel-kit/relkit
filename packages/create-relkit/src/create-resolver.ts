import {
  CREATE_CLOUDS,
  CREATE_DEPLOYMENTS,
  CREATE_TEMPLATES,
  normalizeCreateOptions,
  type CreateOptions,
} from "./options.js";
import { createClackPromptDriver, type PromptDriver } from "./prompt-driver.js";
import { isValidPackageName } from "./validate.js";

const VALUE_OPTIONS = new Set(["template", "cloud", "deploy", "directory"]);

export interface ResolveCreateContext {
  readonly json?: boolean;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
}

export interface ResolvedCreateOptions {
  readonly options: CreateOptions;
  readonly prompted: boolean;
}

export async function resolveCreateOptions(
  args: readonly string[],
  context: ResolveCreateContext = {},
): Promise<CreateOptions> {
  return (await resolveCreateOptionsDetails(args, context)).options;
}

export async function resolveCreateOptionsDetails(
  args: readonly string[],
  context: ResolveCreateContext = {},
): Promise<ResolvedCreateOptions> {
  if (context.interactive !== true) {
    return {
      options: normalizeCreateOptions(
        args,
        context.json === undefined ? {} : { json: context.json },
      ),
      prompted: false,
    };
  }
  const prompt = context.promptDriver ?? createClackPromptDriver("RELKIT_CREATE_CANCELLED");
  const output = [...args];
  const complete =
    Boolean(positional(output)) &&
    ["template", "cloud", "deploy", "directory"].every((name) => has(output, name)) &&
    ["examples", "install", "git"].every((name) => has(output, name) || has(output, `no-${name}`));
  let name = positional(output);
  if (!name) {
    name = await prompt.text({
      message: "Project name",
      validate: (value) =>
        isValidPackageName(value) ? undefined : "Use a valid npm package name.",
    });
    output.unshift(name);
  }
  if (!has(output, "template"))
    output.push(
      "--template",
      await prompt.select({
        message: "Starter template",
        options: CREATE_TEMPLATES.map((value) => ({ value, label: title(value) })),
        initialValue: "minimal",
      }),
    );
  if (!has(output, "cloud"))
    output.push(
      "--cloud",
      await prompt.select({
        message: "Cloud provider",
        options: CREATE_CLOUDS.map((value) => ({ value, label: title(value) })),
        initialValue: "none",
      }),
    );
  if (!has(output, "deploy"))
    output.push(
      "--deploy",
      await prompt.select({
        message: "Deployment adapter",
        options: CREATE_DEPLOYMENTS.map((value) => ({ value, label: title(value) })),
        initialValue: "none",
      }),
    );
  await booleanChoice(output, prompt, "examples", "Include examples?", true);
  await booleanChoice(output, prompt, "install", "Install dependencies?", true);
  await booleanChoice(output, prompt, "git", "Initialize a Git repository?", true);
  if (!has(output, "directory"))
    output.push(
      "--directory",
      await prompt.text({
        message: "Destination",
        initialValue: name,
        validate: (value) => (value?.trim() ? undefined : "A destination is required."),
      }),
    );
  return {
    options: normalizeCreateOptions(
      output,
      context.json === undefined ? {} : { json: context.json },
    ),
    prompted: !complete,
  };
}

async function booleanChoice(
  args: string[],
  prompt: PromptDriver,
  name: "examples" | "install" | "git",
  message: string,
  initialValue: boolean,
): Promise<void> {
  if (has(args, name) || has(args, `no-${name}`)) return;
  args.push(`--${(await prompt.confirm({ message, initialValue })) ? name : `no-${name}`}`);
}

function has(args: readonly string[], name: string): boolean {
  return args.some((value) => value === `--${name}` || value.startsWith(`--${name}=`));
}

function positional(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (value.startsWith("--")) {
      const name = value.slice(2).split("=", 1)[0]!;
      if (!value.includes("=") && VALUE_OPTIONS.has(name)) index += 1;
    } else return value;
  }
  return undefined;
}

function title(value: string): string {
  return value.replace(/^./, (character) => character.toUpperCase());
}
