# Default RelKit templates

The `v1` directory contains the bundled project templates used by the
scaffolder:

- `minimal` — one function and a `GET /hello` route;
- `api` — the minimal example plus a JSON `POST /echo` route;
- `agent` — the minimal example plus a read-only tool and agent descriptor.

Each variant is self-contained and can be copied as a project root. It uses
the current checked-in RelKit package version (`0.0.5`), Bun `1.3.10`, and
TypeScript `5.9.3`. The generator owns project-name substitution and later
installation/Git behavior.
