---
"create-relkit": patch
"@relkit/cli": patch
---

A project created for npm no longer gets a `patchedDependencies` field, which npm ignores; when the
Drizzle declaration repair would apply, creation and `relkit add` say it was skipped and why that is
safe (the repair changes only type declarations), as a warning in the command's output and JSON
result. `relkit add` skips it in a project that names npm in `packageManager` or has a
`package-lock.json`. A project created for pnpm, or one that `relkit add` extends, declares the repair
in `pnpm-workspace.yaml`, where pnpm reads it, instead of `package.json`. An npm project now approves
esbuild's install script with `"allowScripts": { "esbuild": true }`, so npm 11 no longer lists it as
unreviewed on every install; `relkit add database` adds the entry to an npm project that lacks it and
keeps the entries and the choice for esbuild that the project already has.
