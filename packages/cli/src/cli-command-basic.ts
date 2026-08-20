import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
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

export function basicCommands(select: SelectInvocation) {
  const createPath = ["create"] as const;
  const create = document(
    Command.make(
      "create",
      {
        name: stringArgument(createPath, "name"),
        template: optionalChoice(createPath, "template"),
        cloud: optionalChoice(createPath, "cloud"),
        deploy: optionalChoice(createPath, "deploy"),
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
            value.name,
            ...optionArgs("template", value.template),
            ...optionArgs("cloud", value.cloud),
            ...optionArgs("deploy", value.deploy),
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
  return [
    create,
    projectCommand(select, "dev", true, true),
    projectCommand(select, "check"),
    projectCommand(select, "build"),
    projectCommand(select, "start", true),
    doctorCommand(select),
  ] as const;
}

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
      },
      (value) =>
        Effect.sync(() =>
          select(name, [
            ...optionArgs("project-root", value.projectRoot),
            ...("port" in value ? optionArgs("port", value.port) : []),
            ...(value && "inspectorPort" in value
              ? optionArgs("inspector-port", value.inspectorPort)
              : []),
          ]),
        ),
    ),
    path,
  );
}

function doctorCommand(select: SelectInvocation) {
  const path = ["doctor"] as const;
  return document(
    Command.make(
      "doctor",
      {
        projectRoot: optionalString(path, "project-root"),
        port: optionalInteger(path, "port", true),
        inspectorPort: optionalInteger(path, "inspector-port"),
        pulumi: booleanFlag(path, "pulumi"),
        noPulumi: booleanFlag(path, "no-pulumi"),
      },
      (value) =>
        Effect.sync(() =>
          select("doctor", [
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("port", value.port),
            ...optionArgs("inspector-port", value.inspectorPort),
            ...booleanArgs("pulumi", value.pulumi),
            ...booleanArgs("no-pulumi", value.noPulumi),
          ]),
        ),
    ),
    path,
  );
}
