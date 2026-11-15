---
"relkit": patch
---

The error catalogue has `RELKIT_START_BUILD_MISSING` for `relkit start` without a build, and `RELKIT_COMMAND_UNAVAILABLE` now describes a command that is known but not implemented.

The description of `RELKIT_INTERRUPTED` says that Ctrl-C and `SIGTERM` print `Stopped.` and report the code only with `--json`.

The error catalogue has `RELKIT_UNKNOWN_COMMAND` for a command or subcommand `relkit` does not have.

The next step printed with an error no longer tells an npm or pnpm project to run `bun install` or `bun add`: the error catalogue names no package manager's command alone, and the `relkit` launcher names the project's own package manager (from `packageManager` or its lockfile) when the CLI is missing or not installed.
