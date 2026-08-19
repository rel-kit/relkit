# Current 17.19 AWS waiver record

> This file records the controlling owner waiver, not a passing AWS product
> acceptance. The current product-image attempts timed out at service readiness
> before capability smoke. The owner waived another fresh lifecycle on
> `2026-08-19` because the gated run took too long.

Run date: `2026-08-19`
Candidate context: `73a7e3c16e0add0fe4a984d450f1e1c65a4499be`
Bun: `1.3.10`
Pulumi: `3.258.0`
Region: `us-east-1`
Passphrase: process-only; not recorded

## Current result

The current product image reached AWS, but the service did not become ready
before the deadline. `POST /orders` and the SQS, EventBridge, S3, Valkey, and
CloudWatch capability smoke did not run. This record therefore makes no claim
of current cloud create/readiness/smoke/no-op/source-move acceptance.

The guaranteed-finalization destroy completed. An independent post-run tag and
service-status audit found zero live tagged resources, including no active ECS
service, cluster, task, or task-definition state and no remaining NAT gateway.

## Owner decision

Fresh AWS product acceptance is waived as an archive/release prerequisite. The
waiver does not convert the timed-out lifecycle into a pass, and no further AWS
run is required or authorized for this change.

## Historical context

Earlier retained transcripts and topology reports remain historical evidence
only. They must not be cited as current product capability acceptance. The
locally verified contract is the cloud-free product and deployment suite under
`ZSYS_AWS_INTEGRATION=0`.
