# Task 17.12 AWS deployment acceptance

Run date: `2026-08-18`  
Bun: `1.3.10`  
Pulumi: `3.258.0`  
Region: `us-east-1`  
AWS account: redacted  
Stack: `relkit-nightly-1787078392190-14ac0016`
Backend: `s3://relkit-gate15-state-701150241487-20260818154046/relkit-gate15`

## Required deployment suite

The requested root script passed with the real-cloud case explicitly disabled
for the short local suite; the release case was then run separately with a
50-minute test timeout because Bun's default per-test timeout is 5 seconds.

| Command                                                                                                            | Exit | Result                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ---: | --------------------------------------------------------------------------- |
| `RELKIT_AWS_INTEGRATION=0 bun run test:deployment`                                                                   |  `0` | 14 passed, 1 release-gated AWS test skipped, 108 assertions                 |
| first release attempt without passphrase                                                                           |  `1` | stopped before resource creation; Pulumi required an out-of-band passphrase |
| `bun test --timeout 3000000 ./tests/deployment/aws-integration.test.ts` with release gate and ephemeral passphrase |  `0` | 2 passed, 0 failed, 21 assertions, 1434.92s                                 |

The first setup failure is retained in `aws-integration.log`; the successful
retry is retained in `aws-integration-retry.log`. The ephemeral passphrase was
process-only and is not recorded.

## Isolated AWS lifecycle

The existing release-gated Automation API test created a unique stack, waited
for readiness, exercised all smoke paths, applied a no-op, moved source
locations while retaining stable descriptor IDs, destroyed the stack, and
performed its own tag/live-resource cleanup check.

| Stage               | Observed result                                               |
| ------------------- | ------------------------------------------------------------- |
| Initial up          | 66 resources created; no replacements                         |
| Readiness           | `/_relkit/v1/health/ready` became successful before smoke calls |
| No-op up            | 0 changes; 66 unchanged; no replacements                      |
| Source-move preview | 35 tag-only updates, 31 unchanged; 0 replacements             |
| Source-move up      | 35 updated, 31 unchanged; 0 replacements                      |
| Destroy             | 66 resources deleted; Pulumi exit successful                  |
| Test-owned cleanup  | completed without error                                       |

Redacted resource counts and families are in `resource-report.json`; the
Pulumi summary is in `pulumi-summary.txt`.

## Capability smoke outcomes

Every POST returned a successful status and the expected `{ok: true,
operation, marker}` body. The marker is intentionally omitted here.

| Capability                 | Smoke path                                | Result |
| -------------------------- | ----------------------------------------- | ------ |
| Job enqueue/worker         | `/__relkit/aws-smoke/job`                   | pass   |
| Event publish/trigger      | `/__relkit/aws-smoke/event`                 | pass   |
| Bucket put/get             | `/__relkit/aws-smoke/bucket`                | pass   |
| Cache set/get              | `/__relkit/aws-smoke/cache`                 | pass   |
| Logs                       | `/__relkit/aws-smoke/logs`                  | pass   |
| CloudWatch log observation | test marker query through `aws logs tail` | pass   |

## Independent cleanup verification

After the test completed, an independent AWS Resource Groups Tagging API query
used `managed-by=relkit`, `app=full-app`, and the exact stack. It returned five
stale tag records (one EC2 and four ECS records); service-specific liveness
queries classified zero of them as live. The redacted machine-readable result
is `independent-cleanup-verification.json`:

```json
{
  "taggedResourceCount": 5,
  "taggedServiceCounts": { "ec2": 1, "ecs": 4 },
  "liveResourceCount": 0
}
```

No source, package, lockfile, protected normative document, vendor tree, or
later checkbox was changed for this acceptance.
