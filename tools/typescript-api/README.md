# relkit-typescript

Private workspace package. The RelKit workspace type-checks and builds with TypeScript 7, whose
package has no JavaScript compiler API. Tooling that still needs the TypeScript 5.9 API (the
CLI's codemods and source scanning, the boundary and declaration scripts, and compiler tests)
imports `relkit-typescript`, which re-exports this package's own `typescript@5.9.3`.

It is a package rather than an `npm:typescript@5.9.3` alias because an alias is a direct
dependency with a `tsc` executable, and that executable would replace TypeScript 7's `tsc` in
`node_modules/.bin`. `@relkit/cli` bundles it into `dist/typescript-parser.js` at build time, so
published packages never depend on it.
