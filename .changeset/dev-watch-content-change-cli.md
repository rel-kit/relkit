---
"@relkit/cli": patch
---

`relkit dev` rebuilds only when a file's content changed. The operating system also reports files that were read or copied without a change, and cloning the project folder on macOS (as Finder's Duplicate and `cp -c -R` do) made a running server rebuild once for each source file, more than a hundred times over several minutes with nothing different in any file. The watcher now compares each reported file with what it saw at the last decision (its size and a hash of its content, or its size and modification time for a file over 4 MiB), and skips the rebuild when nothing differs. Edits, deleted files and new files still rebuild. The 75 ms quiet window also gathers the events that arrive during it into one rebuild, as intended; it used to start a separate rebuild for each.
