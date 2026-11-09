---
"@relkit/cli": minor
"@relkit/testing": minor
---

New: `relkit add better-auth` writes a plain Better Auth file, `better-auth.ts`, next to the auth service and no route file; RelKit mounts the handler at `--base-path`. The testing package serves auth from the service's own mount when no route mounts it.
