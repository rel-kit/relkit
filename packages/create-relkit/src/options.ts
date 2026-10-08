/**
 * Templates supported by explicit --template selection.
 */
export const CREATE_TEMPLATES = ["minimal", "api", "agent", "fullstack"] as const;
/**
 * Supported template selected by an explicit creation flag.
 */
export type CreateTemplate = (typeof CREATE_TEMPLATES)[number];

/**
 * Supported cloud selections; none is the default.
 */
export const CREATE_CLOUDS = ["aws", "none"] as const;
/**
 * Supported cloud choice for project generation.
 */
export type CreateCloud = (typeof CREATE_CLOUDS)[number];

/**
 * Supported deployment selections; none is the default.
 */
export const CREATE_DEPLOYMENTS = ["pulumi", "none"] as const;
/**
 * Supported deployment choice for project generation.
 */
export type CreateDeployment = (typeof CREATE_DEPLOYMENTS)[number];

/**
 * Supported explicit local job-provider selections.
 */
export const CREATE_JOBS = ["inngest-docker", "effect-mq-docker", "trigger-docker"] as const;
/**
 * Supported local job provider selected by an explicit creation flag.
 */
export type CreateJobs = (typeof CREATE_JOBS)[number];

/**
 * Minimal local defaults applied before explicit create flags are parsed.
 */
export const CREATE_OPTION_DEFAULTS = Object.freeze({
  template: "minimal" as CreateTemplate,
  cloud: "none" as CreateCloud,
  deploy: "none" as CreateDeployment,
  jobs: undefined as CreateJobs | undefined,
  install: true as boolean,
  git: true as boolean,
  examples: true as boolean,
  forceEmptyDirectory: false as boolean,
  json: false as boolean,
});

/**
 * Normalized creation flags preserving omitted directory and job-provider fields.
 */
export interface CreateOptions {
  readonly name: string;
  readonly template: CreateTemplate;
  readonly cloud: CreateCloud;
  readonly deploy: CreateDeployment;
  readonly jobs?: CreateJobs;
  readonly install: boolean;
  readonly git: boolean;
  readonly examples: boolean;
  readonly directory?: string;
  readonly forceEmptyDirectory: boolean;
  readonly json: boolean;
}

/**
 * Additional JSON output policy used while parsing creation flags.
 */
export interface CreateOptionsContext {
  readonly json?: boolean;
}

/**
 * Public creation-flag usage failure with the stable RELKIT_CREATE_USAGE code.
 */
export class CreateOptionsError extends Error {
  /**
   * Stable usage code reported by CreateOptionsError.
   */
  readonly code = "RELKIT_CREATE_USAGE" as const;

  /**
   * Creates the public create-option usage failure.
   * @param message - User-facing diagnostic or prompt text.
   * @returns The canonical CreateOptionsError instance.
   */
  constructor(message: string) {
    super(message);
    this.name = "CreateOptionsError";
  }
}

/**
 * Parses non-interactive create flags and applies the cloud-free defaults.
 * @param args - Literal flag and positional arguments.
 * @param context - Optional JSON output policy applied before argument parsing.
 * @returns Validated creation flags using minimal defaults and preserving omitted directory/jobs fields.
 */
export function normalizeCreateOptions(
  args: readonly string[],
  context: CreateOptionsContext = {},
): CreateOptions {
  let name: string | undefined;
  let directory: string | undefined;
  let template = CREATE_OPTION_DEFAULTS.template;
  let cloud = CREATE_OPTION_DEFAULTS.cloud;
  let deploy = CREATE_OPTION_DEFAULTS.deploy;
  let jobs: CreateJobs | undefined = CREATE_OPTION_DEFAULTS.jobs;
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
    } else if (argument === "--jobs" || argument.startsWith("--jobs=")) {
      const option = readValue(args, index, argument, "--jobs");
      index = option.index;
      jobs = choice(option.value, "--jobs", CREATE_JOBS);
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
    ...(jobs === undefined ? {} : { jobs }),
    install,
    git,
    examples,
    ...(directory === undefined ? {} : { directory }),
    forceEmptyDirectory,
    json,
  });
}

/**
 * Reads an inline or following value for a creation flag.
 * @param args - Literal flag and positional arguments.
 * @param index - Index of the current flag.
 * @param argument - Current literal flag token.
 * @param option - Flag spelling used for inline matching and diagnostics.
 * @returns The nonempty flag value and last consumed argument index.
 */
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

/**
 * Validates a finite command-line choice.
 * @typeParam T - Union of allowed option values.
 * @param value - Raw option value before finite-choice validation.
 * @param option - Flag spelling used in diagnostics.
 * @param allowed - Supported literal values.
 * @returns The supported literal value; unsupported input raises CreateOptionsError.
 */
function choice<T extends string>(value: string, option: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new CreateOptionsError(`${option} must be one of: ${allowed.join("|")}.`);
}
