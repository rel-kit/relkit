# Independent environment, graph and port review

Reviewer: native_gate. Author: coordinator. All 21 listed changed TypeScript files were read
end-to-end with use-effect and repository Effect guidance. This reviewer authored none of them.

## Full coverage

- `packages/cli/src/commands/env.ts`
- `packages/cli/src/commands/env-support.ts`
- `packages/cli/src/commands/env-format.ts`
- `packages/cli/src/commands/env-project.service.ts`
- `packages/cli/src/commands/env-project.types.ts`
- `packages/cli/src/commands/env.schemas.ts`
- `packages/cli/src/commands/env.types.ts`
- `packages/cli/src/commands/graph.ts`
- `packages/cli/src/commands/graph-support.ts`
- `packages/cli/src/commands/graph-file.service.ts`
- `packages/cli/src/commands/graph.schemas.ts`
- `packages/cli/src/commands/graph.types.ts`
- `packages/cli/src/commands/graph-error.ts`
- `packages/cli/src/commands/ports.ts`
- `packages/cli/src/commands/ports.types.ts`
- `packages/cli/src/commands/port-availability.ts`
- `packages/cli/src/commands/port-availability.service.ts`
- `packages/cli/src/commands/port-availability.types.ts`
- `packages/cli/tests/read-services/domain.test.ts`
- `packages/cli/tests/read-services/test-files.ts`
- `packages/cli/tests/read-services/type-probes.test.ts`

## Findings and suitability

No outstanding findings. Domain Layers retain explicit filesystem/module/process requirements;
Promise compatibility runners provision the corresponding live Layers, while Effect leaves retain
caller authority and reuse the shared observer. Pure parsing, presentation and explicit port
precedence remain synchronous. Existing error constructors/codes/reporting shapes remain intact.

Untrusted graph JSON first narrows to a Schema-validated object, then the graph owner's complete
validator checks every node/edge before promotion. Hash/version failures preserve public guidance.
Environment module values remain opaque callback-bearing declarations; marker-only loading retains
the existing public identity contract, and config-owner validation precedes command use. Imports and
example paths preserve containment checks, and examples/statuses redact values before reporting.
Read-only comparisons retain deterministic before/after order rather than introducing concurrency
that would change observed failures. No Cache/RcMap is warranted for finite invocation reads.

Each nonzero native port probe owns one listener through acquireRelease inside a finite Scope.
Listener shutdown must physically complete before availability is reported. Occupied-address
details use the injected bounded process capability; failed optional lsof lookup preserves existing
fallback guidance. Other bind failures retain their original native cause. No long-lived worker,
Ref or Deferred is needed for these finite operations.

Tests supply complete typed service capabilities and reject unexpected authority as defects.
Strict consumer probes compile checked provisioning examples, reject erased/missing live-Layer
requirements and detect a deliberate requirement-erasure mutation; they do not substitute a fake
declaration for the real implementations.

## Actual verification

`rtk bunx vitest run packages/cli/tests/read-services --maxWorkers=1` passed **8/8 tests**
across two test files, including `skipLibCheck:false`, exactOptionalPropertyTypes and
noUncheckedIndexedAccess compiler probes. Log: `/tmp/relkit-root-read-services-review.log`.
Native existing port/environment/graph public compatibility suites remain coordinator acceptance
gates. This review does not claim root main-command files or later additions outside this list.

The final current-source reread is accepted and anchored by `phase-3-read-services-files.json`
(21 SHA-256 rows). Generic environment inference and complete fixture/probe additions preserve
the reviewed semantics. This is a current accepted snapshot; no earlier hash-based drift proof
is claimed because the initial review recorded paths without byte anchors.
