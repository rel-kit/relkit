# Native canonical acceptance identity projection blocker

Author/reviewer investigation: `/root/testing_baseline`. The coordinator alone ran
the held native job probe. Its first run exited 1 without a runner timeout. The first
public trigger succeeded; actual engine handler entry preceded the rejected public get.
No watch request opened and no disconnect acceptance pass is claimed for that attempt.

The actual durable running record is sequence 2 of
`/tmp/relkit-core-consumers-job-held-39c7e6b8/state/jobs/local/native/records.ndjson`.
It identifies run `local-local-6b875693-63df-4c06-b891-3b4fa1a111f9`, job
`acceptance.held-job`, task `acceptance.held-task`, taskVersion/buildId `1`, service
`local`, application `held-jobs`, environment `test`, scope `public:held-jobs` and
attempt 1. Native accepted/start timestamps are valid ISO strings. Source snapshotOf
projects accepted=true, status=running, resultAvailability=pending and a valid current
observedAt, with no own output/cancellation field on this active run. This is a source
reconstruction from actual persisted data, not a new native snapshot execution.

The persisted acceptanceIdentity is the original canonical eight-component typed tuple
from public prepareAdmissionEffect: application, environment, scope, jobId, taskId,
taskVersion, buildId and UUID operationId. Its UTF-8 length is **339 bytes**. Remaining
projected scalar metadata fits 256 bytes: runId48, jobId19, taskId20, version/build1,
service5, inputHash71, scope16, accepted/started/observed timestamps24.

The first rejection is projection-validation.assertSafeRun's optional text loop:
inputHash71 succeeds; inputSchemaHash is absent; acceptanceIdentity339 exceeds the
old default256 bound. boundedText first throws `Job acceptanceIdentity is not available.`
handlers-validation.validateCanonicalRun catches this error, then remaps it to
`Job run data is not available.`, matching the actual public ORPC error. The observed
generic error therefore does not imply an earlier invalid status/shape rejection.

The correction gives only acceptanceIdentity a finite aggregate bound of **12521 bytes**:
eight256-byte scalar components × worst sixfold JSON control-character escaping +233
bytes of fixed typed tuple tags, quotes and punctuation. All other scalar metadata
retains the256-byte limit. Public retryRunOperationEffect passes the original retained
acceptanceIdentity unchanged; public retries do not recursively grow this aggregate.
Direct native adapter retries that append arbitrary/unbounded custom identity histories
remain subject to the finite aggregate guard. The bound does not promise unlimited
authored component sizes or unlimited out-of-band retry prefixes.

No separate normative aggregate bound was found in a targeted Markdown scan of docs
and openspec/specs. Existing task scalar authority TASK_KEY_MAX_BYTES is256 and
namespace/run-locator scalar guards are256. Original held probe labels, authored IDs,
assertions, provider data, HTTP validation logic and failures were preserved; no compact
identity workaround or field stripping was applied.

The focused new regression acquires the real public Local task provider, submits through
public Jobs admission, reads its actual native snapshot and first native observation,
then exercises the existing HTTP canonical validation and get/watch projection. It also
checks worst-case escaped tuple size12521, oversize ASCII/multibyte rejection, malformed
empty/nontext identity rejection, unchanged scalar limits and malformed run rejection.

Relevant EOF-read source evidence:

| Path | SHA-256 |
| --- | --- |
| packages/jobs/src/submission-admission.ts | ce3b25bd94ec4a1cd450d654a287477f6aa826d1766d2a44fe6ebcbd4fb4e5e9 |
| packages/jobs/src/controls-write-operations.ts | 904387447476ce667d9b43b33249bf59f6ea60a68c559870e850f3b809b09c26 |
| packages/jobs/src/task-policy-value.ts | 10ab2940b8b7a4bc6f54706d287937a3afa45902c0c053ef313fe07f1bb04bad |
| packages/runtime-hono/src/jobs/handlers-validation.ts | c33ed4d58086478566562f6375b09fe6b0eb2c04b1a3a7f98a6f7fcbadc2313d |
| packages/providers-local/src/jobs/native-adapter-support.ts | 09115f0c1d515e0291c0410148ecf20c11a54eaedad6f32d3a472863a8dd1d9b |

The coordinator owns regression execution/build/native replay. No test runner, native
probe, host or public provider import was executed by this investigator during diagnosis.
