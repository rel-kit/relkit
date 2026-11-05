import { Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  booleanArgs,
  booleanFlag,
  document,
  keyValueArgs,
  optionArgs,
  optionalChoice,
  optionalKeyValue,
  optionalString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";

/** Builds deployment syntax without acquiring a native workspace or invoking Pulumi.
 *
 * @param select - Invocation recorder; execution owns confirmation and secret handling.
 *
 * @returns The pure deployment parser tree.
 */
export function deployCommand(select: SelectInvocation) {
  const operations = ["preview", "up", "refresh", "outputs", "destroy"] as const;
  const initPath = ["deploy", "init"] as const;
  const init = document(
    Command.make(
      "init",
      {
        target: stringArgument(initPath, "target", false),
        projectRoot: optionalString(initPath, "project-root"),
        stack: optionalString(initPath, "stack"),
        backend: optionalString(initPath, "backend"),
        config: optionalKeyValue(initPath, "config"),
        secrets: optionalKeyValue(initPath, "config-secret"),
        nonInteractive: booleanFlag(initPath, "non-interactive"),
        runtime: optionalChoice(initPath, "runtime"),
        force: booleanFlag(initPath, "force"),
      },
      (value) =>
        Effect.sync(() =>
          select("deploy", [
            "init",
            ...(Option.isSome(value.target) ? [value.target.value] : []),
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("stack", value.stack),
            ...optionArgs("backend", value.backend),
            ...keyValueArgs("config", value.config),
            ...keyValueArgs("config-secret", value.secrets),
            ...booleanArgs("non-interactive", value.nonInteractive),
            ...optionArgs("runtime", value.runtime),
            ...booleanArgs("force", value.force),
          ]),
        ),
    ),
    initPath,
  );
  const commands = operations.map((operation) => {
    const path = ["deploy", operation] as const;
    return document(
      Command.make(
        operation,
        {
          projectRoot: optionalString(path, "project-root"),
          stack: optionalString(path, "stack"),
          backend: optionalString(path, "backend"),
          config: optionalKeyValue(path, "config"),
          secrets: optionalKeyValue(path, "config-secret"),
          nonInteractive: booleanFlag(path, "non-interactive"),
        },
        (value) =>
          Effect.sync(() =>
            select("deploy", [
              operation,
              ...optionArgs("project-root", value.projectRoot),
              ...optionArgs("stack", value.stack),
              ...optionArgs("backend", value.backend),
              ...keyValueArgs("config", value.config),
              ...keyValueArgs("config-secret", value.secrets),
              ...booleanArgs("non-interactive", value.nonInteractive),
            ]),
          ),
      ),
      path,
    );
  });
  return document(Command.make("deploy").pipe(Command.withSubcommands([init, ...commands])), [
    "deploy",
  ]);
}
