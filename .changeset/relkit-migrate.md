---
"@relkit/cli": minor
---

New: `relkit migrate` upgrades a 0.8 application to 0.9. It previews by default, applies with `--write` and undoes with `--rollback <record>`, and lists each place it cannot change with file and line. `relkit migrate layout` is unchanged. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
