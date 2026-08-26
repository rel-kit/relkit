import { Effect, Option } from "effect";
import { Command } from "effect/unstable/cli";
import {
  booleanArgs,
  booleanFlag,
  document,
  optionArgs,
  optionalString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";
import { deployCommand } from "./cli-command-deploy.js";

export function groupCommands(select: SelectInvocation) {
  return [
    graphCommand(select),
    envCommand(select),
    deployCommand(select),
    clientCommand(select),
  ] as const;
}

function clientCommand(select: SelectInvocation) {
  const path = ["client", "pull"] as const;
  const pull = document(
    Command.make(
      "pull",
      {
        baseUrl: stringArgument(path, "baseUrl"),
        out: optionalString(path, "out"),
      },
      (value) =>
        Effect.sync(() =>
          select("client", ["pull", value.baseUrl, ...optionArgs("out", value.out)]),
        ),
    ),
    path,
  );
  return document(Command.make("client").pipe(Command.withSubcommands([pull])), ["client"]);
}

function graphCommand(select: SelectInvocation) {
  const print = graphFileCommand(select, "print");
  const checkPath = ["graph", "check"] as const;
  const check = document(
    Command.make(
      "check",
      {
        graph: stringArgument(checkPath, "graph", false),
        projectRoot: optionalString(checkPath, "project-root"),
        hash: optionalString(checkPath, "hash"),
      },
      (value) =>
        Effect.sync(() =>
          select("graph", [
            "check",
            ...optionalArgument(value.graph),
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("hash", value.hash),
          ]),
        ),
    ),
    checkPath,
  );
  const diffPath = ["graph", "diff"] as const;
  const diff = document(
    Command.make(
      "diff",
      {
        before: stringArgument(diffPath, "before"),
        after: stringArgument(diffPath, "after"),
        projectRoot: optionalString(diffPath, "project-root"),
      },
      (value) =>
        Effect.sync(() =>
          select("graph", [
            "diff",
            value.before,
            value.after,
            ...optionArgs("project-root", value.projectRoot),
          ]),
        ),
    ),
    diffPath,
  );
  return document(Command.make("graph").pipe(Command.withSubcommands([print, check, diff])), [
    "graph",
  ]);
}

function graphFileCommand(select: SelectInvocation, name: "print") {
  const path = ["graph", name] as const;
  return document(
    Command.make(
      name,
      {
        graph: stringArgument(path, "graph", false),
        projectRoot: optionalString(path, "project-root"),
      },
      (value) =>
        Effect.sync(() =>
          select("graph", [
            name,
            ...optionalArgument(value.graph),
            ...optionArgs("project-root", value.projectRoot),
          ]),
        ),
    ),
    path,
  );
}

function envCommand(select: SelectInvocation) {
  const commands = (["check", "list"] as const).map((name) => envStatusCommand(select, name));
  const explainPath = ["env", "explain"] as const;
  const explain = document(
    Command.make(
      "explain",
      {
        name: stringArgument(explainPath, "name"),
        projectRoot: optionalString(explainPath, "project-root"),
        environment: optionalString(explainPath, "environment"),
      },
      (value) =>
        Effect.sync(() =>
          select("env", [
            "explain",
            value.name,
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("environment", value.environment),
          ]),
        ),
    ),
    explainPath,
  );
  const examplePath = ["env", "example"] as const;
  const example = document(
    Command.make(
      "example",
      {
        projectRoot: optionalString(examplePath, "project-root"),
        environment: optionalString(examplePath, "environment"),
        path: optionalString(examplePath, "path"),
        write: booleanFlag(examplePath, "write"),
      },
      (value) =>
        Effect.sync(() =>
          select("env", [
            "example",
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("environment", value.environment),
            ...optionArgs("path", value.path),
            ...booleanArgs("write", value.write),
          ]),
        ),
    ),
    examplePath,
  );
  return document(
    Command.make("env").pipe(Command.withSubcommands([...commands, explain, example])),
    ["env"],
  );
}

function envStatusCommand(select: SelectInvocation, name: "check" | "list") {
  const path = ["env", name] as const;
  return document(
    Command.make(
      name,
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
      },
      (value) =>
        Effect.sync(() =>
          select("env", [
            name,
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("environment", value.environment),
          ]),
        ),
    ),
    path,
  );
}

function optionalArgument(value: Option.Option<string>): readonly string[] {
  return Option.isSome(value) ? [value.value] : [];
}
