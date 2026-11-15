---
"create-relkit": patch
---

Fixed: the install that follows a manifest change may update the lockfile in every package
manager. In a pnpm project it now runs `pnpm install --no-frozen-lockfile`, because pnpm freezes
the lockfile when `CI` is set and refuses a changed `package.json` or `pnpm-workspace.yaml`
(`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`). `npm install` and `bun install` already update the lockfile
under `CI`, so they are unchanged, and the check `relkit doctor` runs stays frozen. The package
manager commands also carry the display text of the install and of adding a dependency.
