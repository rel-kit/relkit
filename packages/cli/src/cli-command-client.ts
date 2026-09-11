import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import {
  document,
  optionArgs,
  optionalString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";

export function clientCommand(select: SelectInvocation) {
  const command = (name: "pull" | "check") => {
    const path = ["client", name] as const;
    return document(
      Command.make(
        name,
        {
          baseUrl: stringArgument(path, "baseUrl"),
          out: optionalString(path, "out"),
        },
        (value) =>
          Effect.sync(() =>
            select("client", [name, value.baseUrl, ...optionArgs("out", value.out)]),
          ),
      ),
      path,
    );
  };
  return document(
    Command.make("client").pipe(Command.withSubcommands([command("pull"), command("check")])),
    ["client"],
  );
}
