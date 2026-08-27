export const CREATE_TEMPLATES = ["minimal", "api", "agent"] as const;
export type CreateTemplate = (typeof CREATE_TEMPLATES)[number];

export const CREATE_CLOUDS = ["aws", "none"] as const;
export type CreateCloud = (typeof CREATE_CLOUDS)[number];

export const CREATE_DEPLOYMENTS = ["pulumi", "none"] as const;
export type CreateDeployment = (typeof CREATE_DEPLOYMENTS)[number];

export const CREATE_OPTION_DEFAULTS = Object.freeze({
  template: "minimal" as CreateTemplate,
  cloud: "aws" as CreateCloud,
  deploy: "pulumi" as CreateDeployment,
  install: true as boolean,
  git: true as boolean,
  examples: true as boolean,
  forceEmptyDirectory: false as boolean,
  json: false as boolean,
});

export interface CreateOptions {
  readonly name: string;
  readonly template: CreateTemplate;
  readonly cloud: CreateCloud;
  readonly deploy: CreateDeployment;
  readonly install: boolean;
  readonly git: boolean;
  readonly examples: boolean;
  readonly directory?: string;
  readonly forceEmptyDirectory: boolean;
  readonly json: boolean;
}

export interface CreateOptionsContext {
  readonly json?: boolean;
}

export class CreateOptionsError extends Error {
  readonly code = "RELKIT_CREATE_USAGE" as const;

  constructor(message: string) {
    super(message);
    this.name = "CreateOptionsError";
  }
}

/** Parses the non-interactive create flags and applies the v3 defaults. */
export function normalizeCreateOptions(
  args: readonly string[],
  context: CreateOptionsContext = {},
): CreateOptions {
  let name: string | undefined;
  let directory: string | undefined;
  let template = CREATE_OPTION_DEFAULTS.template;
  let cloud = CREATE_OPTION_DEFAULTS.cloud;
  let deploy = CREATE_OPTION_DEFAULTS.deploy;
  let install = CREATE_OPTION_DEFAULTS.install;
  let git = CREATE_OPTION_DEFAULTS.git;
  let examples = CREATE_OPTION_DEFAULTS.examples;
  let forceEmptyDirectory = CREATE_OPTION_DEFAULTS.forceEmptyDirectory;
  let json = CREATE_OPTION_DEFAULTS.json || context.json === true;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") json = true;
    else if (argument === "--force-empty-directory") forceEmptyDirectory = true;
    else if (argument === "--install") install = true;
    else if (argument === "--no-install") install = false;
    else if (argument === "--git") git = true;
    else if (argument === "--no-git") git = false;
    else if (argument === "--examples") examples = true;
    else if (argument === "--no-examples") examples = false;
    else if (argument === "--template" || argument.startsWith("--template=")) {
      const option = readValue(args, index, argument, "--template");
      index = option.index;
      template = choice(option.value, "--template", CREATE_TEMPLATES);
    } else if (argument === "--cloud" || argument.startsWith("--cloud=")) {
      const option = readValue(args, index, argument, "--cloud");
      index = option.index;
      cloud = choice(option.value, "--cloud", CREATE_CLOUDS);
    } else if (argument === "--deploy" || argument.startsWith("--deploy=")) {
      const option = readValue(args, index, argument, "--deploy");
      index = option.index;
      deploy = choice(option.value, "--deploy", CREATE_DEPLOYMENTS);
    } else if (argument === "--directory" || argument.startsWith("--directory=")) {
      const option = readValue(args, index, argument, "--directory");
      index = option.index;
      directory = option.value;
    } else if (argument.startsWith("-")) {
      throw new CreateOptionsError(`Unknown create option: ${argument}`);
    } else if (name === undefined) name = argument;
    else throw new CreateOptionsError("Only one project name is allowed.");
  }

  if (name === undefined) throw new CreateOptionsError("Usage: create-relkit <name> [options]");
  return Object.freeze({
    name,
    template,
    cloud,
    deploy,
    install,
    git,
    examples,
    ...(directory === undefined ? {} : { directory }),
    forceEmptyDirectory,
    json,
  });
}

function readValue(
  args: readonly string[],
  index: number,
  argument: string,
  option: string,
): { readonly value: string; readonly index: number } {
  const prefix = `${option}=`;
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length);
    if (value.length > 0) return { value, index };
  } else {
    const value = args[index + 1];
    if (value !== undefined && !value.startsWith("-")) return { value, index: index + 1 };
  }
  throw new CreateOptionsError(`${option} requires a value.`);
}

function choice<T extends string>(value: string, option: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new CreateOptionsError(`${option} must be one of: ${allowed.join("|")}.`);
}
