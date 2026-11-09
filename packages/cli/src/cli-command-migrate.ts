/** Builds pure migration syntax; actual filesystem work belongs to the migration services. */
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
 * @returns The migrate command: the 0.9 code migration, with `layout` as a subcommand.
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
  const root = ["migrate"] as const;
  const migrate = Command.make(
    "migrate",
    {
      projectRoot: optionalString(root, "project-root"),
      write: booleanFlag(root, "write"),
      rollback: optionalString(root, "rollback"),
      contract: optionalString(root, "contract"),
    },
    (value) =>
      Effect.sync(() =>
        select("migrate", [
          ...optionArgs("project-root", value.projectRoot),
          ...booleanArgs("write", value.write),
          ...optionArgs("rollback", value.rollback),
          ...optionArgs("contract", value.contract),
        ]),
      ),
  );
  return document(migrate.pipe(Command.withSubcommands([layout])), root);
}
