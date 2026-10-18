# Implementation baseline

Recorded on 2026-10-18 at revision `05a53404222d9c5de4ef0126d719066ca21b6f30`.
Schema: `spec-driven`; initial implementation progress: 0/31.

The only initial dirty path was this untracked change directory. No product,
template, dependency, sample, release identity, or separate readiness-change file
has been modified during the compatibility investigation. No Git operations,
deployment, cloud services, or user-database migrations were performed.

## Instructions and inventory

Read proposal, design, tasks, both delta specs, root AGENTS.md, the referenced
RTK.md, apply-change, konsistent-config, Effect (including services/layers and
testing references), skill-creator, repository relkit-app, and the shipped
minimal application skill. There are no more-specific AGENTS.md files in the
affected CLI, generator, scripts, tests, or template trees. The commerce-web
subtree has separate instructions and was not edited. No Effect implementation
was changed; its upstream implementation/test/example inspection remains
mandatory before subsequent Effect implementation. The optional upstream
`repos/effect/.agents/AGENTS.md` and `repos/effect/LLMS.md` files are absent.
For the type-only compatibility probe, inspected SqlError implementation in
both the read-only checkout and installed Effect 4.0.1, its checkout test,
and the checkout's Effect.Error type-test usage. The checkout lacks Effect.ts;
the utility's conditional-type implementation was checked in installed
`node_modules/effect/src/Effect.ts` instead.

[baseline-inventory.json](baseline-inventory.json) records hashes for 81 relevant
template/guidance/config files, every one of the 54 patch hunks, all four sample
history files, and the separate readiness change. The maintained skill trees
are `templates/default/v1/{minimal,api,agent,fullstack,tasks}/.agents/skills/relkit`;
repository guidance is `.agents/skills/relkit-app`. Each shipped tree contains
the entrypoint and 12 references. Relevant references include data-apis,
domain-apis, http-apis, testing-apis, cli, and layout-migration; unaffected API
references must remain intact.

The database samples are `examples/data-model` and `examples/auth-drizzle`.
Each contains one timestamped migration directory with SQL and snapshot metadata.
Their configs currently use `./drizzle`. Commerce and commerce-web have no
root Drizzle config/history. No sample database was opened; applied-history
proof uses an owned disposable fixture instead.

## Resource and ownership baseline

Commands: `sysctl -n hw.logicalcpu hw.memsize`, `uptime`, `memory_pressure`,
`vm_stat`, `top -l 1 -n 0`, `sysctl -n kern.memorystatus_vm_pressure_level`, and
`ps -axo pid,ppid,%cpu,rss,command -r`.

Observed capacity: 10 logical CPUs, 16 GiB RAM. Initial load averages were
5.48/5.61/5.34. The CPU sample showed 35.54% idle; physical unused memory was
133 MiB with approximately 5 GiB compressed. The separate `memory_pressure`
summary reported 51% free and kernel pressure level was initially 1 (normal).
An unrelated Next build and existing user applications were preserved.

Pressure subsequently rose to 2. The first exploratory fixture attempt had
already run and is retained in `compatibility/runs/initial-probe`; no further
compilation was launched while correcting that attempt. Its 512 MiB RC5
full-declaration compiler exhausted its configured heap. This is a resource
failure, not evidence of dependency compatibility. The corrected harness checks
pressure before each child and uses targeted declaration diagnostics rather
than repeating that heavy compilation. After pressure returned to 1, its
sequential, nice-10, 512 MiB, 120-second-bounded probes completed.

The harness creates an independent temporary root outside the monorepo, records
each child PID/command, joins children, and removes the root on exit. No browser,
watcher, dev server, database daemon, or container was launched. Owned cleanup
and preservation are verified separately in the verification report.

## Requirement-to-task evidence map

All rows below remain acceptance requirements; preparatory evidence does not
complete their implementation tasks.

| Delta requirement                                           | Task IDs              | Required evidence                                                                        |
| ----------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Remove portable-repair requirement; patch-free dependencies | 1.2, 2.1–2.5, 6.1–6.3 | Compatibility matrix, release sync/idempotency, transactional rollback, packed consumers |
| Backend defaults preserve selected frontend                 | 4.4, 5.3, 6.2, 6.4    | Generated file inventory and backend/fullstack behavior                                  |
| Complete framework ignores; track migrations                | 4.2, 6.4              | Actual Git ignore checks for all maintained templates                                    |
| Database service owns one history                           | 4.1, 4.3–4.5, 6.3     | Dialect scaffold/auth-reuse checks and unchanged history hashes/log                      |
| RELKIT owns migration execution                             | 3.1–3.4, 4.1, 6.2–6.3 | Config/preflight/path/runtime tests and packed command execution                         |
| Lazy consumer migration dependencies                        | 3.6, 6.2              | No-database CLI and missing-dependency packed tests                                      |
| Invocation/output/lifecycle conventions                     | 3.5, 6.1, 6.6         | Secret-safe JSON, exits, interruption and joined cleanup                                 |
| Stable sample history                                       | 4.3, 6.3              | SQL/snapshot hashes, applied-log rows, no-op and subsequent migration                    |
| Fresh independent acceptance identities                     | 6.2–6.5               | Current candidate hashes, admitted tuples, separate readiness evidence                   |
| Intent-aware application skills                             | 5.1, 5.5              | Feature/bug/discussion/mixed live scenario evidence                                      |
| Contextual onboarding                                       | 5.2, 5.5              | Combined missing choices, supplied/no-database/auth-conflict scenarios                   |
| Intentional optional modules                                | 5.2, 5.5              | Requested/unrequested realtime and installed-API scenarios                               |
| Backend resource contracts and privacy                      | 5.3, 5.5              | Users/orders input/access tests, protocol/infrastructure/fullstack rubric                |
| History versus shared migration machinery                   | 4.5, 5.5              | Implemented command guidance and executed database/auth workflow                         |
| Behavior-backed completion                                  | 5.4–5.5, 6.5          | HTTP bug replay and blocked-verification reporting scenarios                             |
| Experimental development boundaries                         | 5.6                   | Root/contributor diff preserving data and existing compatibility APIs                    |
| Distributed guidance parity and behavior                    | 5.5, 6.4–6.5          | All maintained trees, links, package inclusion and model evaluations                     |
