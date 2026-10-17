# Proposal

## Why

Release runs 38954309786 and 38976443609 returned all correct packed responses with clean shutdown, but failed a one-second wall-clock assertion on shared runners. Changing the shared runner family did not make latency deterministic.

## What Changes

- Certify release functionality with all 20 fresh starts, 20 restarts, and restart preparation inside the existing 30-second terminal deadline.
- Retain exact identities, every sample, cleanup checks, and unchanged strict one-second performance results in an explicitly versioned readiness report.
- Keep strict performance certification as a separate manual workflow. A slow sample still fails performance certification, but does not suppress a functionally supported creation tuple.
- Preserve legacy strict evidence and rollback on missing, stale, partial, or functionally failed evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `acceptance-verification`: Separate release correctness admission from host-dependent performance certification.
- `cli-scaffolding`: Gate offered combinations on complete functional evidence; keep timing claims conditional on measured host evidence.

## Impact

Packed benchmark reports, creation certification and evidence readers, release workflows, contributor guidance, and focused regression tests. No paid infrastructure, new supported tuples, runtime startup changes, or relabeling of historical reports.
