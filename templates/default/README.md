# Default RelKit templates

The `v1` directory contains the bundled project templates used by the
scaffolder:

- `minimal` — one function and a `GET /hello` route;
- `api` — the minimal example plus a JSON `POST /echo` route and an orders service;
- `agent` — the minimal example plus a native LangChain agent and LangGraph workflow;
- `fullstack` — the agent backend plus a Next.js web app using the typed client;
- `tasks` — an orders service with a task and a durable job on a selected jobs provider.

`create-relkit` offers all five. A template CI has not yet measured on your Bun
version prints a `RELKIT_CREATE_UNTESTED` warning; `--strict` refuses it instead.

Each variant is self-contained and can be copied as a project root. It uses
the current checked-in RelKit package version (`0.8.8`), Bun `1.3.10`, and
TypeScript `5.9.3`. The generator owns project-name substitution and later
installation/Git behavior.
