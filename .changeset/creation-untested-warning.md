---
"@relkit/cli": patch
"@relkit/local": patch
"create-relkit": patch
---

Creation offers all five templates (`minimal`, `api`, `agent`, `fullstack`, `tasks`) and works on current Bun: a combination CI has not tested prints a `RELKIT_CREATE_UNTESTED` warning and continues, and `--strict` refuses it before writing any file. `create-relkit --help` lists the options. The `tasks` template now installs its jobs provider's SDK, and creation checks a project the prepared development snapshot cannot capture instead of failing. Local Docker job workers now resolve project packages, which Bun could not find through `NODE_PATH`.
