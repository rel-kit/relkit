import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import {
  booleanArgs,
  booleanFlag,
  document,
  keyValueArgs,
  optionArgs,
  optionalKeyValue,
  optionalString,
  type SelectInvocation,
} from "./cli-command-shared.js";

export function deployCommand(select: SelectInvocation) {
  const operations = ["init", "preview", "up", "refresh", "outputs", "destroy"] as const;
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
  return document(Command.make("deploy").pipe(Command.withSubcommands(commands)), ["deploy"]);
}
