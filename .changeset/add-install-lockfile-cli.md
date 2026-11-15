---
"@relkit/cli": patch
---

Fixed: `relkit add` names your package manager in what it prints. The next steps, the check command
in the result, the reason a check was skipped, and a failed install now say `npm install` and
`npm run check` in an npm project, and `pnpm install` and `pnpm run check` in a pnpm project,
instead of `bun install` and `bun run check`; a failed install starts with the command that
failed. The next steps of `relkit add inspector`, the next steps of `relkit migrate` and
`relkit migrate layout`, and the message that asks you to install `drizzle-orm` or `drizzle-kit`
before `relkit db migrate` follow your package manager the same way.

Fixed: `relkit add database` in a pnpm project no longer fails with
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` when `CI` is set. `add` changes the manifest and the workspace
file before it installs, and pnpm freezes the lockfile under `CI`, so the install now runs with
`--no-frozen-lockfile`.
