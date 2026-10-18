/** Parses database tooling without loading configuration or optional drivers. */
import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionalString,
  optionArgs,
  type SelectInvocation,
} from "./cli-command-shared.js";

/** Builds the finite migration command under the existing invocation owner. */
export function dbCommand(select: SelectInvocation) {
  const path = ["db", "migrate"] as const;
  const migrate = document(
    Command.make("migrate", { config: optionalString(path, "config") }, (value) =>
      Effect.sync(() => select("db", ["migrate", ...optionArgs("config", value.config)])),
    ),
    path,
  );
  return document(Command.make("db").pipe(Command.withSubcommands([migrate])), ["db"]);
}
