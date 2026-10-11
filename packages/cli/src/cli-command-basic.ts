/** Builds direct-command syntax as pure metadata without acquiring domain services. */
import { Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  booleanArgs,
  booleanFlag,
  document,
  optionArgs,
  optionalChoice,
  optionalInteger,
  optionalString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";

/** Builds the six direct project command parsers without executing them.
 *
 * @param select - Records a parsed invocation.
 *
 * @returns Create, dev, check, build, start and doctor in root help order.
 */
export function basicCommands(select: SelectInvocation) {
  return [
    createCommand(select),
    projectCommand(select, "dev", true, true),
    projectCommand(select, "check"),
    projectCommand(select, "build"),
    projectCommand(select, "start", true),
    doctorCommand(select),
  ] as const;
}

/**
 * Builds creation syntax independently from project startup options.
 * @param select - Invocation recorder supplied by the root parser.
 * @returns Pure creation command with existing literal argument serialization.
 */
function createCommand(select: SelectInvocation) {
  const createPath = ["create"] as const;
  const create = document(
    Command.make(
      "create",
      {
        name: stringArgument(createPath, "name", false),
        template: optionalChoice(createPath, "template"),
        cloud: optionalChoice(createPath, "cloud"),
        deploy: optionalChoice(createPath, "deploy"),
        jobs: optionalChoice(createPath, "jobs"),
        directory: optionalString(createPath, "directory"),
        install: booleanFlag(createPath, "install"),
        noInstall: booleanFlag(createPath, "no-install"),
        git: booleanFlag(createPath, "git"),
        noGit: booleanFlag(createPath, "no-git"),
        examples: booleanFlag(createPath, "examples"),
        noExamples: booleanFlag(createPath, "no-examples"),
        forceEmpty: booleanFlag(createPath, "force-empty-directory"),
      },
      (value) =>
        Effect.sync(() =>
          select("create", [
            ...(Option.isSome(value.name) ? [value.name.value] : []),
            ...optionArgs("template", value.template),
            ...optionArgs("cloud", value.cloud),
            ...optionArgs("deploy", value.deploy),
            ...optionArgs("jobs", value.jobs),
            ...optionArgs("directory", value.directory),
            ...booleanArgs("install", value.install),
            ...booleanArgs("no-install", value.noInstall),
            ...booleanArgs("git", value.git),
            ...booleanArgs("no-git", value.noGit),
            ...booleanArgs("examples", value.examples),
            ...booleanArgs("no-examples", value.noExamples),
            ...booleanArgs("force-empty-directory", value.forceEmpty),
          ]),
        ),
    ),
    createPath,
  );
  return create;
}

/** Builds one project parser with only its supported optional flags.
 *
 * @param select - Invocation recorder.
 * @param name - Command name.
 *
 * @param port - Includes the application port.
 * @param inspectorPort - Includes inspector flags.
 *
 * @returns A pure command retaining existing argument serialization.
 */
function projectCommand(
  select: SelectInvocation,
  name: "dev" | "check" | "build" | "start",
  port = false,
  inspectorPort = false,
) {
  const path = [name] as const;
  return document(
    Command.make(
      name,
      {
        projectRoot: optionalString(path, "project-root"),
        ...(port ? { port: optionalInteger(path, "port", true) } : {}),
        ...(inspectorPort ? { inspectorPort: optionalInteger(path, "inspector-port") } : {}),
        ...(name === "dev"
          ? {
              local: optionalChoice(path, "local"),
              logLevel: optionalChoice(path, "log-level"),
              verbose: booleanFlag(path, "verbose"),
              noColor: booleanFlag(path, "no-color"),
              prepare: booleanFlag(path, "prepare"),
            }
          : {}),
      },
      (value) =>
        Effect.sync(() =>
          select(name, [
            ...optionArgs("project-root", value.projectRoot),
            ...("port" in value ? optionArgs("port", value.port) : []),
            ...(value && "inspectorPort" in value
              ? optionArgs("inspector-port", value.inspectorPort)
              : []),
            ...(value && "local" in value ? optionArgs("local", value.local) : []),
            ...("logLevel" in value ? optionArgs("log-level", value.logLevel) : []),
            ...("verbose" in value ? booleanArgs("verbose", value.verbose) : []),
            ...("noColor" in value ? booleanArgs("no-color", value.noColor) : []),
            ...("prepare" in value ? booleanArgs("prepare", value.prepare) : []),
          ]),
        ),
    ),
    path,
  );
}

/** Builds prerequisite-selection syntax without probing the host.
 *
 * @param select - Invocation recorder.
 *
 * @returns The pure doctor command.
 */
function doctorCommand(select: SelectInvocation) {
  const path = ["doctor"] as const;
  return document(
    Command.make(
      "doctor",
      {
        projectRoot: optionalString(path, "project-root"),
        port: optionalInteger(path, "port", true),
        inspectorPort: optionalInteger(path, "inspector-port"),
        noPorts: booleanFlag(path, "no-ports"),
        pulumi: booleanFlag(path, "pulumi"),
        noPulumi: booleanFlag(path, "no-pulumi"),
      },
      (value) =>
        Effect.sync(() =>
          select("doctor", [
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("port", value.port),
            ...optionArgs("inspector-port", value.inspectorPort),
            ...booleanArgs("no-ports", value.noPorts),
            ...booleanArgs("pulumi", value.pulumi),
            ...booleanArgs("no-pulumi", value.noPulumi),
          ]),
        ),
    ),
    path,
  );
}
