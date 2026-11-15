---
"relkit": patch
---

The error catalogue has `RELKIT_START_BUILD_MISSING` for `relkit start` without a build, and `RELKIT_COMMAND_UNAVAILABLE` now describes a command that is known but not implemented.

The description of `RELKIT_INTERRUPTED` says that Ctrl-C and `SIGTERM` print `Stopped.` and report the code only with `--json`.

The error catalogue has `RELKIT_UNKNOWN_COMMAND` for a command or subcommand `relkit` does not have.
