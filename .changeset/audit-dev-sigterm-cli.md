---
"@relkit/cli": patch
---

Fixed: `SIGTERM` sent to `relkit dev` alone now ends the process within a few seconds and leaves
nothing behind. The type-check watch runs the project's compiler behind a JavaScript launcher (the
`typescript` 7 launcher on Bun and on Node before 22.15, `tsgo`, or any launcher script) that
starts the native compiler as its own child and does not forward signals; stopping only the
launcher left the native compiler running with the output pipe open, so the CLI logged
`dev.stopped` but never exited. The watch now starts in its own process group, a stop signals the
whole group, escalates to `SIGKILL` after one second, and cancels the output reader. Ctrl+C in a
terminal behaves as before. On Windows, which has no process groups, only the launcher is
signalled.
