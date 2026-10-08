import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionArgs,
  optionalString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";

/** Builds client contract syntax without fetching a running application.
 *
 * @param select - Invocation recorder.
 *
 * @returns The pure client pull/check parser tree.
 */
export function clientCommand(select: SelectInvocation) {
  /** Constructs one client operation with the shared URL and output syntax.
   *
   * @param name - Client operation.
   *
   * @returns Its URL/output argument parser.
   */
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
