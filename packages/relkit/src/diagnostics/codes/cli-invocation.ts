/** Codes reported by the `relkit` command when a command cannot start from what you typed or built. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const cliInvocationCodes = [
  {
    code: "RELKIT_START_BUILD_MISSING",
    title: "No build to start",
    happened:
      "`relkit start` found no complete build in `.relkit/build`, because the project was never built or the last build did not finish.",
    fix: "Run `relkit build` in the project and wait for it to succeed, then run `relkit start` again.",
  },
  {
    code: "RELKIT_UNKNOWN_COMMAND",
    title: "Unknown relkit command",
    happened: "`relkit` has no command with the name you typed.",
    fix: "Run `relkit --help` to see every command, or `relkit <command> --help` to see its subcommands.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
