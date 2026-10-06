# Generator independent review

Reviewer: `/root/native_gate`, independent of `/root/plan_create_relkit`.
Status: accepted. All 135 current authored package TypeScript files are covered.

Applied use-effect, repository Effect guidance, installed Effect 4.0.1 and the
available read-only vendor implementations/tests. Missing vendor core sources
were checked against installed sources and exact-version upstream references.
Rolling full-EOF reads covered every original leaf, new split, test and fixture;
final functional deltas were reread through EOF. The author's AST reconstruction
of 429 actual JSDoc spans across 94 files found no unexpected implementation
delta. Reviewer checked the final documentation corrections and verified every
final inventory SHA against current bytes: 135 matches, zero mismatches.

## Findings resolved

- Injected runners now abort and await physical native settlement before rollback;
  the controlled ignored-signal late-lockfile regression passes.
- All file and directory restoration attempts settle; bounded secondary cleanup
  evidence retains failures, suppressing only expected absent/nonempty directories.
- Independently callable resolution/planning/path/generation operations use shared
  execution observation, preserving typed requirements and private-value redaction.
- Executed strict compiler probes check positive examples, non-any requirements,
  missing services and a deliberately erased-environment mutation.
- New type companions, responsibility splits and concrete TSDoc cover the final
  leaves. Incorrect constructor lookup/error ownership/boolean/shell-string/path
  descriptions found during the documentation pass were corrected.
- A baseline root-parent canonicalization bug dropped the first character of
  missing segments. basename now preserves complete segments; a controlled
  GeneratorPaths Layer proves /missing and /missing/nested.

Services capture narrow explicit authority. Per-request planning owns private
Ref state. Scoped native subprocess, staging and restoration lifetimes retain
physical completion before rollback. Public Promise/error/JSON contracts remain
unchanged. Pure source/AST/render leaves preserve RELKIT authoring APIs; no
artificial services, Cache or RcMap are needed for finite pure request work.

## Independent verification

- Strict package test configuration: passed.
- `bunx --bun vitest run --config packages/create-relkit/vitest.config.ts --maxWorkers=1`:
  14 tests passed across six files, including final path regression.
- Focused manifest/addition/resolver/patch Bun tests: 57 passed.
- Final inventory hash verification: 135/135 current files.
- Evidence logs: /tmp/relkit-generator-final-strict.log,
  /tmp/relkit-generator-final-effect-bun.log,
  /tmp/relkit-generator-final-focused.log.
- An initial Vitest invocation without --bun used Node and could not execute Bun
  native adapters. The documented Bun invocation passed; its initial log remains.
  Broad combined repository/demo verification belongs to the coordinator.

Final repository verification exposed the executable test's direct `Bun.spawn` use under
the Node-backed runner. The portability fix and final repository-width formatting were
independently reread through EOF; the accepted 57-line source has SHA-256
`5603b16735e8fecb6e49aabcc12c91ab254956f6a62761beb0fff6ea15f6e26e`.
It uses Node's native process API to invoke an explicit Bun child, drains both pipes and
joins physical closure, with a five-second SIGKILL timeout. Passive imports, usage exit 2,
empty stderr and exactly one JSON stdout line remain asserted. An independent Node-backed
`rtk proxy bunx vitest run --maxWorkers=1 --disableConsoleIntercept
packages/create-relkit/tests/executable.effect.test.ts` passed **1/1**, exit 0, in
`/tmp/relkit-generator-executable-portable-review.log`. The author's exact Bun-config
rerun also passed; the initial Node failure remains recorded rather than reclassified.

## Supporting independent coverage

Full EOF reads accepted final scripts/release-check-support.ts and
scripts/pack-and-smoke-exports.ts concrete generator bin checks;
scripts/test-generator.ts serial strict/Effect gates; compiler/src/index.ts and
config-loader-types.ts LoadedToolingConfigSchema export; read-services/test-files.ts
exclusive-write/chmod fallback; contracts/src/operation-runtime.ts and operation.ts
captured-context runners. Shared runners acquire no new graph and Cause.squash
retains original public failure/defect identity.

## Final file coverage

Each file below was independently reviewed and classified; exact accepted SHA
bytes are retained in phase-3-generator-files.json.

| File | Classification |
| --- | --- |
| `packages/create-relkit/src/add-name.ts` | pure-option-parsing |
| `packages/create-relkit/src/add-options-parser.ts` | pure-option-parsing |
| `packages/create-relkit/src/add-options-resource.ts` | pure-option-parsing |
| `packages/create-relkit/src/add-options.ts` | pure-option-parsing |
| `packages/create-relkit/src/add-output.ts` | pure-output-formatting |
| `packages/create-relkit/src/add-plan.ts` | cohesive-domain-service |
| `packages/create-relkit/src/add-plan.types.ts` | type-contract |
| `packages/create-relkit/src/add-resolution-discovery.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolution-prompt.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolution-state-base.ts` | private-ref-state |
| `packages/create-relkit/src/add-resolution-state.ts` | compatibility-edge |
| `packages/create-relkit/src/add-resolution-state.types.ts` | type-contract |
| `packages/create-relkit/src/add-resolver-domain-execution.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver-domain-input.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver-domain.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver-platform.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver-provider.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver-resources.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/add-resolver.ts` | cohesive-domain-service |
| `packages/create-relkit/src/add-resolver.types.ts` | type-contract |
| `packages/create-relkit/src/add-transaction-files-compat.ts` | compatibility-edge |
| `packages/create-relkit/src/add-transaction-files.ts` | scoped-transaction-workflow |
| `packages/create-relkit/src/add-transaction-files.types.ts` | type-contract |
| `packages/create-relkit/src/add-transaction-process.ts` | process-workflow |
| `packages/create-relkit/src/add-transaction-workflow.ts` | scoped-transaction-workflow |
| `packages/create-relkit/src/add-transaction.ts` | cohesive-domain-service |
| `packages/create-relkit/src/add-transaction.types.ts` | type-contract |
| `packages/create-relkit/src/add-types.ts` | type-contract |
| `packages/create-relkit/src/bin.ts` | runtime-edge |
| `packages/create-relkit/src/bucket-profiles.ts` | typed-planning-workflow |
| `packages/create-relkit/src/bucket-profiles.types.ts` | type-contract |
| `packages/create-relkit/src/build-catalog.ts` | pure-catalog-manifest |
| `packages/create-relkit/src/catalog-resolution.ts` | pure-catalog-manifest |
| `packages/create-relkit/src/catalog-resolution.types.ts` | type-contract |
| `packages/create-relkit/src/create-preview.ts` | typed-io-workflow |
| `packages/create-relkit/src/create-preview.types.ts` | type-contract |
| `packages/create-relkit/src/create-resolver.ts` | typed-resolution-workflow |
| `packages/create-relkit/src/create-resolver.types.ts` | type-contract |
| `packages/create-relkit/src/dependency-patch-installation.ts` | typed-io-workflow |
| `packages/create-relkit/src/dependency-patches.ts` | typed-io-workflow |
| `packages/create-relkit/src/dependency-patches.types.ts` | type-contract |
| `packages/create-relkit/src/domain-artifact.ts` | pure-source-rendering |
| `packages/create-relkit/src/domain-planning.ts` | typed-planning-workflow |
| `packages/create-relkit/src/domain-planning.types.ts` | type-contract |
| `packages/create-relkit/src/generate-deployment.ts` | typed-io-workflow |
| `packages/create-relkit/src/generate-files-compat.ts` | compatibility-edge |
| `packages/create-relkit/src/generate-files-utilities.ts` | typed-io-workflow |
| `packages/create-relkit/src/generate-files-utilities.types.ts` | type-contract |
| `packages/create-relkit/src/generate-files.ts` | typed-io-workflow |
| `packages/create-relkit/src/generate-output.ts` | pure-output-formatting |
| `packages/create-relkit/src/generate-output.types.ts` | type-contract |
| `packages/create-relkit/src/generate-process.ts` | process-workflow |
| `packages/create-relkit/src/generate-stage-cleanup.ts` | diagnostic-ownership |
| `packages/create-relkit/src/generate-types.ts` | type-contract |
| `packages/create-relkit/src/generate-workflow.ts` | scoped-transaction-workflow |
| `packages/create-relkit/src/generate.service.types.ts` | type-contract |
| `packages/create-relkit/src/generate.ts` | cohesive-domain-service |
| `packages/create-relkit/src/generator-cleanup.ts` | diagnostic-ownership |
| `packages/create-relkit/src/generator-cleanup.types.ts` | type-contract |
| `packages/create-relkit/src/generator-errors.ts` | schema-boundary |
| `packages/create-relkit/src/generator-filesystem.ts` | native-io-service |
| `packages/create-relkit/src/generator-filesystem.types.ts` | type-contract |
| `packages/create-relkit/src/generator-paths.ts` | native-io-service |
| `packages/create-relkit/src/generator-paths.types.ts` | type-contract |
| `packages/create-relkit/src/generator-process.ts` | native-io-service |
| `packages/create-relkit/src/generator-process.types.ts` | type-contract |
| `packages/create-relkit/src/generator-prompt.ts` | native-io-service |
| `packages/create-relkit/src/generator-prompt.types.ts` | type-contract |
| `packages/create-relkit/src/generator-runtime.ts` | runtime-edge |
| `packages/create-relkit/src/index.ts` | pure-barrel |
| `packages/create-relkit/src/options.ts` | pure-option-parsing |
| `packages/create-relkit/src/plan-builder-effects.ts` | private-ref-state |
| `packages/create-relkit/src/plan-builder-files.ts` | private-ref-state |
| `packages/create-relkit/src/plan-builder-files.types.ts` | type-contract |
| `packages/create-relkit/src/plan-builder-manifest.ts` | typed-planning-workflow |
| `packages/create-relkit/src/plan-builder.ts` | compatibility-edge |
| `packages/create-relkit/src/plan-builder.types.ts` | type-contract |
| `packages/create-relkit/src/plan-manifest.ts` | pure-catalog-manifest |
| `packages/create-relkit/src/plan-manifest.types.ts` | type-contract |
| `packages/create-relkit/src/project-catalog.ts` | typed-io-workflow |
| `packages/create-relkit/src/project-discovery-app.ts` | pure-ast-discovery |
| `packages/create-relkit/src/project-discovery-database.ts` | pure-ast-discovery |
| `packages/create-relkit/src/project-discovery-facts.ts` | pure-ast-discovery |
| `packages/create-relkit/src/project-discovery-types.ts` | type-contract |
| `packages/create-relkit/src/project-discovery.service.types.ts` | type-contract |
| `packages/create-relkit/src/project-discovery.ts` | cohesive-domain-service |
| `packages/create-relkit/src/project-manifest.schemas.ts` | schema-boundary |
| `packages/create-relkit/src/prompt-driver.ts` | runtime-edge |
| `packages/create-relkit/src/prompt-driver.types.ts` | type-contract |
| `packages/create-relkit/src/provider-planning-definitions.ts` | pure-source-rendering |
| `packages/create-relkit/src/provider-planning.ts` | typed-planning-workflow |
| `packages/create-relkit/src/provider-planning.types.ts` | type-contract |
| `packages/create-relkit/src/provider-profile-definition.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-ai-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-ai.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-auth-schema.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-auth-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-auth.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-database-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-database.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-domain-callables.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-domain-events.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-domain-jobs.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-domain-register.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-domain-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-domain.ts` | pure-barrel |
| `packages/create-relkit/src/render-domain.types.ts` | type-contract |
| `packages/create-relkit/src/render-resource-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-resources.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-route-sources.ts` | pure-source-rendering |
| `packages/create-relkit/src/render-routes.ts` | typed-planning-workflow |
| `packages/create-relkit/src/render-service.ts` | typed-planning-workflow |
| `packages/create-relkit/src/scaffold-catalog.ts` | pure-catalog-manifest |
| `packages/create-relkit/src/scaffold-catalog.types.ts` | type-contract |
| `packages/create-relkit/src/source-edit.ts` | pure-ast-discovery |
| `packages/create-relkit/src/source-factory-edit.ts` | pure-ast-discovery |
| `packages/create-relkit/src/source-import-edit.ts` | pure-ast-discovery |
| `packages/create-relkit/src/template-root.ts` | typed-io-workflow |
| `packages/create-relkit/src/validate-errors.ts` | public-error-contract |
| `packages/create-relkit/src/validate-paths.ts` | typed-io-workflow |
| `packages/create-relkit/src/validate.ts` | typed-io-workflow |
| `packages/create-relkit/src/validate.types.ts` | type-contract |
| `packages/create-relkit/tests/dependency-patch-generation.test.ts` | foundation-regression-test |
| `packages/create-relkit/tests/dependency-patches.fixture.ts` | test-fixture |
| `packages/create-relkit/tests/dependency-patches.test.ts` | foundation-regression-test |
| `packages/create-relkit/tests/environment.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/tests/executable.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/tests/generator-environment.probe.ts` | compiler-probe |
| `packages/create-relkit/tests/generator-services.fixture.ts` | test-fixture |
| `packages/create-relkit/tests/native-process.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/tests/observation.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/tests/planning.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/tests/project-catalog.test.ts` | foundation-regression-test |
| `packages/create-relkit/tests/transaction-lifecycle.effect.test.ts` | effect-regression-test |
| `packages/create-relkit/vitest.config.ts` | test-configuration |
