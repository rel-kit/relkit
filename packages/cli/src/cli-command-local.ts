import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import {
  booleanArgs,
  booleanFlag,
  document,
  optionArgs,
  optionalString,
  type SelectInvocation,
} from "./cli-command-shared.js";

export function localCommand(select: SelectInvocation) {
  const commands = (["up", "status", "stop", "reset"] as const).map((name) => {
    const path = ["local", name] as const;
    return document(
      Command.make(
        name,
        {
          projectRoot: optionalString(path, "project-root"),
          service: optionalString(path, "service"),
          environment: optionalString(path, "environment"),
          ...(name === "up" ? { detach: booleanFlag(path, "detach") } : {}),
          ...(name === "reset"
            ? { yes: booleanFlag(path, "yes"), dryRun: booleanFlag(path, "dry-run") }
            : {}),
        },
        (value) =>
          Effect.sync(() =>
            select("local", [
              name,
              ...optionArgs("project-root", value.projectRoot),
              ...optionArgs("service", value.service),
              ...optionArgs("environment", value.environment),
              ...(value && "detach" in value ? booleanArgs("detach", value.detach) : []),
              ...(value && "yes" in value ? booleanArgs("yes", value.yes) : []),
              ...(value && "dryRun" in value ? booleanArgs("dry-run", value.dryRun) : []),
            ]),
          ),
      ),
      path,
    );
  });
  return document(Command.make("local").pipe(Command.withSubcommands(commands)), ["local"]);
}
