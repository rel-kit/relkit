/** Builds pure layout migration syntax; actual filesystem work belongs to its service. */
import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  booleanFlag,
  document,
  optionalString,
  optionArgs,
  booleanArgs,
  type SelectInvocation,
} from "./cli-command-shared.js";

/**
 * Builds migration syntax from shared metadata without acquiring project services.
 * @param select - Invocation recorder.
 * @returns The migrate command group.
 */
export function migrateCommand(select: SelectInvocation) {
  const path = ["migrate", "layout"] as const;
  const layout = document(
    Command.make(
      "layout",
      {
        projectRoot: optionalString(path, "project-root"),
        write: booleanFlag(path, "write"),
        rollback: optionalString(path, "rollback"),
      },
      (value) =>
        Effect.sync(() =>
          select("migrate", [
            "layout",
            ...optionArgs("project-root", value.projectRoot),
            ...booleanArgs("write", value.write),
            ...optionArgs("rollback", value.rollback),
          ]),
        ),
    ),
    path,
  );
  return document(Command.make("migrate").pipe(Command.withSubcommands([layout])), ["migrate"]);
}
