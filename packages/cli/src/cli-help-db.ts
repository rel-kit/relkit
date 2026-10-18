/** Shared database help, completion and generated documentation metadata. */
import { command, option } from "./cli-help-builders.js";

export const dbHelp = command(
  "db",
  "Manage application database migrations",
  "relkit db <command>",
  {
    commands: [
      command(
        "migrate",
        "Apply pending migrations using the application's installed tools",
        "relkit db migrate",
        {
          options: [
            option(
              "config",
              "string",
              "Application Drizzle config; defaults to drizzle.config.ts. Relative paths use the application root",
            ),
          ],
        },
      ),
    ],
  },
);
