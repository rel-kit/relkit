# Docker recovery, 2026-10-04

Docker Desktop was running but its engine socket did not answer bounded HTTP
`/_ping` requests. The selected context was `desktop-linux`, without DOCKER_HOST
or DOCKER_CONTEXT overrides. Before any recovery action, the configured VM path
`~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` and its `vms`
directory were absent. Spotlight found no replacement Docker.raw. The old VM
process still referenced that missing path; the cause of the missing disk is
unknown. Host free space was21GiB.

`rtk docker desktop restart --timeout 30` failed because the backend/VM/UI
processes did not stop. `rtk docker desktop stop --force --timeout 30` succeeded,
followed by `rtk docker desktop start --timeout 45`. No factory reset, data purge,
prune, credential deletion or manual Docker filesystem deletion was performed.
Desktop recreated its missing sparse VM disk. Before testing, the new engine
reported zero containers/images/volumes; previous Docker data was not recovered.

Recovery verification passes:

- Engine socket `/_ping` returns OK repeatedly; server version29.4.3.
- Official `hello-world` image pulls and runs successfully with `--rm`.
- The repository's exact pinned Redis digest pulls successfully.
- A uniquely labeled recovery volume is written by one container and read by
  a second container; the persisted value matches. Both containers use `--rm`.
- The owned volume is removed; final container and volume inventories are empty.
- Only the two downloaded verification images remain cached.
- Original demo source remains Git-clean; no framework source was changed.

The additional candidate `rtk bun run test:local-docker` fails at MinIO container
creation, after2.18s. This is a new registry prerequisite, not a daemon timeout:
the exact pinned Quay image returns `unauthorized: access to the requested
resource is not authorized`. A clean temporary Docker configuration with no
saved credentials produces the same denial. Docker Hub's official MinIO tag and
exact digest also fail with `insufficient_scope: authorization failed`. The
temporary anonymous configuration and owned test volume are removed.

The registry denial must be resolved before Redis/MinIO/demo acceptance can pass.
No registry credentials were obtained or changed, and no replacement image or
source assertion was substituted. The failed focused-suite output is retained
in `docker-recovery-local-services.log`. Prior verifier failure remains historical
evidence; it is not relabeled as passing after recovering the daemon.
