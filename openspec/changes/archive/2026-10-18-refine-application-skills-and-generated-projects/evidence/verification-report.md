# Verification report: compatibility investigation

Change: `refine-application-skills-and-generated-projects`.
Date: 2026-10-18. Schema: `spec-driven`. Progress: **3/31 tasks complete**.

## Completed this session

- 1.1: Read the implementation contract, recorded revision/dirty boundaries,
  inventoried maintained guidance/templates/samples, and mapped delta requirements
  to tasks and required evidence in [baseline.md](baseline.md).
- 1.2: Audited all 54 patch hunks, traced patch production/distribution/rollback
  ownership, and recorded exact candidate versions and distinct failure checks in
  [compatibility-matrix.md](compatibility-matrix.md).
- 1.3: Recorded resource/process baseline and used serial independent fixtures
  with bounded children; the corrected harness defers each child when kernel
  memory pressure is not normal.

## Observed compatibility, separately from implementation acceptance

The corrected compatibility harness completed successfully as an investigation;
its zero exit does **not** mean that a candidate passed the compatibility gate.
All three unpatched tuples failed. The patched baseline passed the targeted
declaration control. The newer RC passed SQLite history/data preservation,
subsequent migration and fresh-schema checks, but reproduced all seven checked
declaration failures. The stable tuple cannot consume unchanged current history.
Full commands, registry integrities, SQL/snapshot hashes, log rows and raw results
are linked from the matrix.

The initial probe is retained with its genuine failures: its limited library
set lacked TextDecoderOptions, the 512 MiB RC5 full compilation exhausted its
heap, and fresh log comparison incorrectly included applied_at. The corrected
probe uses the established strict packed fixture's default library set, checks
the relevant declaration files directly, and separates migration identity from
fresh execution timestamps. These corrections neither change product compiler
settings nor establish full-package compatibility.

No auth HTTP flow, PostgreSQL/MySQL database, RELKIT packed consumer,
new migration CLI, generated scaffold change, sample move, skill behavior
evaluation, template certification, or readiness measurement was performed.
They remain required and unchecked. No existing public tuple or performance
threshold was changed. Task 2.2 remains unresolved: no compliant integration
adjustment has been proven, and it cannot close as unnecessary.

## Local checks

| Command/check                                                                                                 | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `rtk python3 openspec/changes/refine-application-skills-and-generated-projects/evidence/compatibility/run.py` | Corrected investigation completed; candidates rejected as recorded         |
| Registry archive SHA-512 verification and all-hunk SHA-256 audit                                              | Passed; both RCs retain 46 obsolete imports                                |
| Python AST parse of run.py                                                                                    | Passed                                                                     |
| Prettier on added Markdown/JS/TS evidence and tasks.md                                                        | Passed                                                                     |
| `rtk openspec validate refine-application-skills-and-generated-projects --strict`                             | Passed                                                                     |
| `rtk git diff --check`                                                                                        | Passed for tracked diff; untracked authored evidence checked with Prettier |
| Re-read apply instructions                                                                                    | `ready`, 3 complete / 28 remaining; CLI instructs pausing on blockers      |
| Hash preservation                                                                                             | 92 inventoried template/guidance/history/readiness files unchanged         |
| Tracked implementation diff                                                                                   | Empty; only this initially untracked change directory was edited           |

Broad repository checks/builds were not started: no product source or dependency
was changed, the negative compatibility gate is already conclusive for these
candidates, and repeating the full compiler after its heap failure would add no
needed acceptance evidence.

## Cleanup and pause

[cleanup-and-preservation.json](cleanup-and-preservation.json) verifies all 40
recorded child PIDs have exited, every owned temporary fixture root was removed,
the original revision is retained, and all inventoried protected files match.
The initial attempt's cleanup flag was unset when its assertion interrupted the
script; independent final filesystem/PID checks confirm that its context manager
also removed that attempt's fixtures. No server, browser, watcher, database
daemon, container, or infrastructure remains from this session. Existing user
applications and services were not stopped. Final memory pressure was normal.

Tasks 2.1–2.5 and dependent acceptance remain open. Implementation pauses at the
explicit compatibility gate and apply skill blocker rule. Independent guidance
work is permitted by the design; it has not been implemented or evaluated here.
No patch removal or compatible delivery is claimed.
