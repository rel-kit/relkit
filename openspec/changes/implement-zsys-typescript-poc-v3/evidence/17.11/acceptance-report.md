# Task 17.11 acceptance

Run date: `2026-08-18T21:31:24+03:00`  
Bun: `1.3.10`

## Packed artifact smoke

| Command                                         | Exit | Evidence                                      |
| ----------------------------------------------- | ---: | --------------------------------------------- |
| `bun run scripts/pack-and-smoke-create-zsys.ts` |  `0` | `packed-smoke.stdout.txt`; 27 packed packages |

## Getting started flow

The flow used a fresh parent under
`/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/zsys-getting-started-5prpLq`
and the exact generated project path
`/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/zsys-getting-started-5prpLq/my-app`.
The local registry
served the freshly packed artifacts at `http://127.0.0.1:49646`.

| Step             | Exact command or action                                            | Exit/result                                                                         |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| packed bootstrap | `bun install --force --no-cache --registry http://127.0.0.1:49646` | `0`                                                                                 |
| create           | `bunx create-zsys@latest my-app`                                   | `0`                                                                                 |
| install          | `bun install`                                                      | `0`                                                                                 |
| dev              | `bun run dev`                                                      | started on documented port `3000`                                                   |
| route            | `curl "http://localhost:3000/hello?name=ZSys"`                     | `0`; `{"message":"Hello, ZSys!"}`                                                   |
| inspector        | `curl "http://localhost:3000/_zsys/v1/graph"`                      | `0`; graph response contained `protocol`, `version`, `graphHash`, and manifest hash |
| stop             | `Ctrl-C` / `SIGINT`                                                | exit `130`                                                                          |
| test             | `bun run test`                                                     | `0`                                                                                 |
| check            | `bun run check`                                                    | `0`                                                                                 |
| build            | `bun run build`                                                    | `0`                                                                                 |

The graph and manifest hashes matched at
`sha256:0c00c9cd7ab37388964c7bf0461a0e402fcbc2e26fcf434b1e26e7011f286417`.
The graph response keys also included `graphContractVersion`,
`manifestContractVersion`, and `manifestGeneratorVersion`; each is version `1`
for the packed server protocol.

The current generator's approved default options enable its Pulumi/AWS doctor
checks, so the disposable harness supplied a local no-op `pulumi` executable
and `AWS_PROFILE=zsys-docs-smoke`. No deployment command or cloud API call was
made. The parent harness directory was retained; only the resolved
`my-app` project was removed, and `projectRemoved=true` was verified.

The packed entrypoint now executes its generator when invoked as a binary, and
the generator resolves the copied template tree when Bun runs the package from
its cache. These are the only product changes required by this acceptance.
