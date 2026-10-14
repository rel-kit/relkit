# Retained restart setup attempt

`bun scripts/benchmark-packed-dev.ts --runs 20 --set restart --output
openspec/changes/adopt-grouped-service-layout/evidence/packed-restart-1.json`
did not reach any measurement. The retained log is
`/tmp/grouped-packed-restart-1.log`; the owned temporary root is
`/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-readiness-kvfoOK`.

Release staging stopped after its last command at 18:10:42 on 2026-10-13.
After more than six minutes, the owned Bun process had no child processes or
network listeners. A native one-second sample recorded idle event/thread pools
in `/tmp/grouped-readiness-stall.sample.txt`; it does not establish the exact
pending JavaScript operation. The partially staged release workspace is retained
at `relkit-release-stage-ngVPkn` under the same temporary-directory parent.

SIGTERM requested scoped interruption but did not settle the pending finite
native adapter. The owned process alone was then terminated with SIGKILL.
No measured sample, successful restart, or readiness certification is claimed
for this setup attempt. The next numbered attempt reruns the complete set.
