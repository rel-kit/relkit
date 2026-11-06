/** Static metadata shared by migration parser, help, completion and generated reference. */
import { command, option } from "./cli-help-builders.js";
import { projectRoot } from "./cli-help-options.js";

export const migrateHelp = command(
  "migrate",
  "Preview and apply the 0.9 code migration, or layout migrations",
  "relkit migrate [--write | --rollback <record>]",
  {
    options: [
      projectRoot,
      option("write", "boolean", "Apply the previewed changes and write a migration record"),
      option(
        "rollback",
        "string",
        "Restore files from a migration record; refuses to overwrite later edits",
      ),
      option(
        "contract",
        "string",
        "Client contract (client-contract.json) used to name api properties for hook keys",
      ),
    ],
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
              "Restore files from a migration record; refuses to overwrite later edits",
            ),
          ],
        },
      ),
    ],
  },
);
