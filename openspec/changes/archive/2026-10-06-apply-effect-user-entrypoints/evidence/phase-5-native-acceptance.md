# Final account-free container, deployment and Docker acceptance

Executor: native_gate. Candidate prerequisite: root reported a fresh CLI dependency build passed
34/34 tasks in 5.669 seconds (`/tmp/relkit-effect-final-cli-build.log`). Cloud and AWS opt-ins
were explicitly disabled on every acceptance command; no cloud resources were created.

## Commands and actual results

All commands were run from the candidate worktree with the pinned Bun 1.3.10 runtime.

```sh
rtk proxy env RELKIT_TEST_DOCKER=1 RELKIT_TEST_ALL_CLOUD=0 RELKIT_AWS_INTEGRATION=0 UPDATE_GOLDEN=0 bun test tests/deployment
rtk proxy env RELKIT_TEST_DOCKER=1 RELKIT_TEST_ALL_CLOUD=0 RELKIT_AWS_INTEGRATION=0 UPDATE_GOLDEN=0 bun test tests/container
rtk proxy env RELKIT_TEST_DOCKER=1 RELKIT_TEST_ALL_CLOUD=0 RELKIT_AWS_INTEGRATION=0 UPDATE_GOLDEN=0 bun test tests/integration/local-docker-services.test.ts tests/integration/local-docker-composite.test.ts tests/integration/local-docker-worker.test.ts
```

- Deployment: **14 passed, 1 explicitly skipped, 0 failed**, 78 assertions, exit 0, 2.52 seconds.
  The skipped case creates a real AWS host; local preview uses an injected isolated SDK command,
  and AWS role materialization uses Pulumi mocks. Log: `/tmp/relkit-final-deployment.log`.
- Container: **3 passed, 0 failed**, 20 assertions, exit 0, 4.10 seconds. This covers reproducible
  production context, liveness before readiness, admission rejection, in-flight cancellation,
  telemetry flushing and bounded physical exit. Log: `/tmp/relkit-final-container-exit.log`.
- Docker: **3 passed, 0 failed**, 47 assertions, exit 0, 26.20 seconds. This covers owned worker
  startup, Redis/MinIO adoption and persisted data, and Inngest composite adoption/reset.
  Log: `/tmp/relkit-final-local-docker.log`.

The original combined container/deployment command exposed three container failures because its
legacy manually linked fixture omitted `@relkit/cli`, now required for the emitted private runtime
helper import. A controlled fixture reproduced the exact unresolved import. The one-line fixture
fix adds `cli` to its workspace links; root independently read the whole file and accepted the delta.
Original log: `/tmp/relkit-final-container-deployment.log`. The first corrected rerun reported
3 passing cases but had process exit 1 without a diagnostic (`/tmp/relkit-final-container.log`);
the isolated final rerun above passed all cases with exit 0. Historical logs remain intact.
Current independently accepted source hash is in `phase-5-native-supporting-files.json`.

## Resource preservation and cleanup evidence

Snapshots were captured before and after the isolated Docker gate:
`/tmp/relkit-final-docker-{before,after}.txt`, plus matching volume and network lists.
All existing containers retain their original IDs and names and remain running:

- `f2d57b503b16` — `relkit-5a604da7155b-1c9fcad5c582-service`, healthy.
- `8460e126c8df` — `relkit-5a604da7155b-58cd0e35b2fc-service`, healthy.
- `14d161cb0b6b` — `priceless_feistel`.

No pre-existing volume or network was removed. No new container or network remains. The test
reconcilers clean resources using labels derived from their unique temporary project roots;
no global prune or broad cleanup command was run.

Three additional dangling volumes were observed, carrying only Docker's anonymous-volume label:

| Volume ID | Created at UTC |
| --- | --- |
| `0c2deec15aca249c2f46effb6bd139083eed79d0d14ec1ff8ac1915a6a07f29b` | 2026-10-05 20:35:10 |
| `83f30d9d8f305a5915efe81de3b20d18eaa101e0a70c9ee63df43273e972192b` | 2026-10-05 20:35:13 |
| `28187f611f9bea4c4659ce1631e048af894be4d16e0df130dbd542eafe629acc` | 2026-10-05 20:35:32 |

Their creation times fall inside the test gate, but Docker's retained event history no longer
contains mount receipts proving ownership. They are retained, following the coordinator's explicit
instruction to avoid speculative deletion. This evidence does not claim anonymous-volume cleanup.
