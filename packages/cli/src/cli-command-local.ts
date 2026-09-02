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
          ...(name === "up" ? { detach: booleanFlag(path, "detach") } : {}),
          ...(name === "reset" ? { yes: booleanFlag(path, "yes") } : {}),
        },
        (value) =>
          Effect.sync(() =>
            select("local", [
              name,
              ...optionArgs("project-root", value.projectRoot),
              ...(value && "detach" in value ? booleanArgs("detach", value.detach) : []),
              ...(value && "yes" in value ? booleanArgs("yes", value.yes) : []),
            ]),
          ),
      ),
      path,
    );
  });
  return document(Command.make("local").pipe(Command.withSubcommands(commands)), ["local"]);
}
