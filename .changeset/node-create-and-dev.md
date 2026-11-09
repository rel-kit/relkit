---
"relkit": minor
"@relkit/cli": minor
"create-relkit": minor
---

New: `create-relkit` and the `relkit` CLI run on Node 22.13+ and 24 with npm or pnpm as well as on Bun. `npx create-relkit` and `pnpm dlx create-relkit` install with the manager that started them (or `--package-manager bun|npm|pnpm`), and `relkit dev`, `check`, `doctor`, `build` and `start` run on Node: application TypeScript runs through esbuild-based module hooks, `relkit build` bundles with esbuild and builds for Node by default there, and every change starts a new development generation. The runtime adapter gains `processes` (spawn, IPC, `which`) and `modules` (resolution and, on Bun, the evictable registry), and `createModuleReloader` takes the adapter's `modules`.
