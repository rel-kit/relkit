/** Codes reported by the `relkit` command before it hands over to the project's CLI. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const launcherCodes = [
  {
    code: "RELKIT_PROJECT_CLI_INVALID",
    title: "The installed CLI package is damaged",
    happened:
      "The `relkit` command found `@relkit/cli` in the project, but its `package.json` names no `relkit` command or points outside the package.",
    fix: "Reinstall `@relkit/cli` as a development dependency of the project, then run the command again.",
  },
  {
    code: "RELKIT_PROJECT_CLI_REQUIRED",
    title: "The project does not install the RelKit CLI",
    happened:
      "The `relkit` command runs the `@relkit/cli` package installed in your project, and the project does not declare or install it.",
    fix: "Add `@relkit/cli` to the project's development dependencies, then run the command again.",
  },
  {
    code: "RELKIT_PROJECT_CLI_VERSION",
    title: "The project's CLI version differs from relkit",
    happened:
      "The `relkit` command and the project's `@relkit/cli` have different versions. Every RelKit package is released with the same version.",
    fix: "Install the same version of `relkit` and `@relkit/cli` in the project, then run the command again.",
  },
  {
    code: "RELKIT_PROJECT_REQUIRED",
    title: "The command was run outside a project",
    happened:
      "The `relkit` command looked for a `package.json` in the current folder and its parents and found none.",
    fix: "Run the command from your project folder, pass `--project-root <folder>`, or create a project with `relkit create <name>`.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
