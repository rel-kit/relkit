/** Static metadata shared by migration parser, help, completion and generated reference. */
import { command, option } from "./cli-help-builders.js";
import { projectRoot } from "./cli-help-options.js";

export const migrateHelp = command(
  "migrate",
  "Preview and apply source layout migrations",
  "relkit migrate <command>",
  {
    commands: [
      command(
        "layout",
        "Move flat services into src/services with guarded rollback",
        "relkit migrate layout",
        {
          options: [
            projectRoot,
            option("write", "boolean", "Validate and apply; stop development first"),
            option(
              "rollback",
              "string",
              "Restore a local migration receipt; conflicts refuse overwrite",
            ),
          ],
        },
      ),
    ],
  },
);
