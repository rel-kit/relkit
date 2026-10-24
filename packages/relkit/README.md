# relkit

Run the RELKIT CLI with Bun:

```sh
bunx relkit --help
bunx relkit create my-app
```

Use `bunx relkit@latest` to request the latest published release, or install the
command globally with `bun add --global relkit`.

Creation delegates to the lightweight `create-relkit` package. Project commands use the
project's explicitly installed `@relkit/cli` at the same release version. Missing or
mismatched project CLIs produce installation guidance without fetching packages.
Generated applications depend on `@relkit/cli` and do not need this wrapper.

`npx relkit create my-app` is also supported when Bun >=1.3.10 is installed on PATH.
Bun remains the application runtime.
