---
"@relkit/cli": patch
---

`relkit start` in a project that was never built now fails with `RELKIT_START_BUILD_MISSING` ("No build found in .relkit/build") and tells you to run `relkit build` first, instead of printing the operating system error twice. The CLI prints a code only when it is a RelKit code; any other error is reported as `RELKIT_INTERNAL_ERROR` with its original message.

Stopping `relkit dev`, `relkit start` or `relkit inspector` with Ctrl+C or `SIGTERM` no longer prints an error block: the terminal shows one line, `Stopped.` (or `relkit dev`'s own `Development server stopped`), and the exit status stays 130 or 143. `--json` output and `SIGHUP` still report `RELKIT_INTERRUPTED`.

An unknown command or subcommand now fails with `RELKIT_UNKNOWN_COMMAND` and exit status 2 (a usage error) instead of `RELKIT_COMMAND_UNAVAILABLE` and 1. The message names the unknown word, keeps the parser's "Did you mean" suggestion for a near miss and lists the available commands (or the subcommands of the command you typed).
