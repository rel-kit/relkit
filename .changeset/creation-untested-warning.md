---
"@relkit/cli": patch
"create-relkit": patch
---

Creation offers all five templates (`minimal`, `api`, `agent`, `fullstack`, `tasks`) and works on current Bun: a combination CI has not tested prints a `RELKIT_CREATE_UNTESTED` warning and continues, and `--strict` refuses it before writing any file. `create-relkit --help` lists the options.
