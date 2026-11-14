---
"create-relkit": patch
"@relkit/cli": patch
---

A project created for npm no longer gets a `patchedDependencies` field, which npm ignores; when the
Drizzle declaration repair would apply, creation says it was skipped and why that is safe (the repair
changes only type declarations). `relkit add` skips it the same way in a project that names npm in
`packageManager` or has a `package-lock.json`. A project created for pnpm declares the repair in
`pnpm-workspace.yaml`, where pnpm reads it, instead of `package.json`. An npm project now approves
esbuild's install script with `"allowScripts": { "esbuild": true }`, so npm 11 no longer lists it as
unreviewed on every install.
