# relkit

Run the RELKIT CLI with Bun:

```sh
bunx relkit --help
bunx relkit create my-app
```

Use `bunx relkit@latest` to request the latest published release, or install the
command globally with `bun add --global relkit`.

This package delegates to `@relkit/cli` at the same exact release version.
Generated applications continue to depend on `@relkit/cli`.
