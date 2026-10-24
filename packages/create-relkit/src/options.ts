/** Validates and normalizes pure creation options before selecting templates, destinations and optional installation or Git initialization. */

import { createParsingState, applyCreateBoolean, readValue, choice } from "./options-parser.js";
/** Templates supported by explicit --template selection. */
export const CREATE_TEMPLATES = ["minimal", "api", "agent", "fullstack"] as const;
/** Supported template selected by an explicit creation flag. */
export type CreateTemplate = (typeof CREATE_TEMPLATES)[number];
/** Supported cloud selections; none is the default. */
export const CREATE_CLOUDS = ["aws", "none"] as const;
/** Supported cloud choice for project generation. */
export type CreateCloud = (typeof CREATE_CLOUDS)[number];
/** Supported deployment selections; none is the default. */
export const CREATE_DEPLOYMENTS = ["pulumi", "none"] as const;
/** Supported deployment choice for project generation. */
export type CreateDeployment = (typeof CREATE_DEPLOYMENTS)[number];
/** Supported explicit local job-provider selections. */
export const CREATE_JOBS = ["inngest-docker", "effect-mq-docker", "trigger-docker"] as const;
/** Supported local job provider selected by an explicit creation flag. */
export type CreateJobs = (typeof CREATE_JOBS)[number];
/** Minimal local defaults applied before explicit create flags are parsed. */
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
/** Normalized creation flags preserving omitted directory and job-provider fields. */
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
/** Additional JSON output policy used while parsing creation flags. */
export interface CreateOptionsContext {
  readonly json?: boolean;
}
/** Public creation-flag usage failure with the stable RELKIT_CREATE_USAGE code. */
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
  const state = createParsingState(context);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (applyCreateBoolean(argument, state)) continue;
    else if (argument === "--template" || argument.startsWith("--template=")) {
      const option = readValue(args, index, argument, "--template");
      index = option.index;
      state.template = choice(option.value, "--template", CREATE_TEMPLATES);
    } else if (argument === "--cloud" || argument.startsWith("--cloud=")) {
      const option = readValue(args, index, argument, "--cloud");
      index = option.index;
      state.cloud = choice(option.value, "--cloud", CREATE_CLOUDS);
    } else if (argument === "--deploy" || argument.startsWith("--deploy=")) {
      const option = readValue(args, index, argument, "--deploy");
      index = option.index;
      state.deploy = choice(option.value, "--deploy", CREATE_DEPLOYMENTS);
    } else if (argument === "--jobs" || argument.startsWith("--jobs=")) {
      const option = readValue(args, index, argument, "--jobs");
      index = option.index;
      state.jobs = choice(option.value, "--jobs", CREATE_JOBS);
    } else if (argument === "--directory" || argument.startsWith("--directory=")) {
      const option = readValue(args, index, argument, "--directory");
      index = option.index;
      state.directory = option.value;
    } else if (argument.startsWith("-")) {
      throw new CreateOptionsError(`Unknown create option: ${argument}`);
    } else if (state.name === undefined) state.name = argument;
    else throw new CreateOptionsError("Only one project name is allowed.");
  }
  if (state.name === undefined)
    throw new CreateOptionsError("Usage: create-relkit <name> [options]");
  return Object.freeze({
    name: state.name,
    template: state.template,
    cloud: state.cloud,
    deploy: state.deploy,
    ...(state.jobs === undefined ? {} : { jobs: state.jobs }),
    install: state.install,
    git: state.git,
    examples: state.examples,
    ...(state.directory === undefined ? {} : { directory: state.directory }),
    forceEmptyDirectory: state.forceEmptyDirectory,
    json: state.json,
  });
}
