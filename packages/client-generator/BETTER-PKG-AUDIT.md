# Client generator Better Pkg audit

The authored package has 40 executable source modules, 32 sibling type modules,
one barrel, one constant data module, 18 Vitest files, and one test fixture.
Generated dist declarations and coverage reports are excluded from authored
file limits. Every authored TypeScript file is at most 200 lines.

## Runtime module inventory

The named calculations in each row return Effect values. Public synchronous
functions are compatibility adapters around the corresponding observed Effect.
Internal calculation exports compose with yield* and share their parent's span.

| Module                                    | Effect calculations or public Effect operations                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| generate.ts                               | generateClientEffect and generateClientTypeScriptEffect                                                                                                                                   |
| generate-schema-render.ts                 | recordCalculation, schemaDocumentCalculation, literalTypeCalculation, schemaTypeCalculation                                                                                               |
| generate-schema.ts                        | schemaTypeEffect, schemaAtEffect, responseSchemaEffect                                                                                                                                    |
| generate-types.ts                         | clientRoutesEffect, mappedInputTypeEffect, responseTypeEffect, httpTriggerEffect                                                                                                          |
| generate-mappings.ts                      | collectMappingsEffect, responseContractsEffect, visitMapping                                                                                                                              |
| input-tree.ts                             | addInputFieldEffect, renderInputTreeEffect                                                                                                                                                |
| route-parameters.ts                       | routeParametersEffect                                                                                                                                                                     |
| generate-request-statements.ts            | hasBodyEffect, pathStatementsEffect, queryStatementsEffect, headerStatementsEffect, bodyStatementsEffect                                                                                  |
| generate-request.ts                       | acceptsMissingInputEffect, routeMethodEffect                                                                                                                                              |
| generate-runtime-helpers.ts               | runtimeHelpersEffect                                                                                                                                                                      |
| generate-contract.ts                      | generateContractEffect, generateClientContractDocumentEffect, errorDocumentsCalculation, errorsCalculation                                                                                |
| generate-contract-from-document.ts        | generateContractFromDocumentEffect                                                                                                                                                        |
| generate-public-manifest.ts               | publicManifestEffect                                                                                                                                                                      |
| generate-registry-fingerprint.ts          | publicFingerprintEffect, generateClientManifestEffect                                                                                                                                     |
| generate-registry.ts                      | generateClientRegistryFromDocumentEffect, generateClientRegistryEffect, registrySourceEffect                                                                                              |
| generate-agent-contract-validation.ts     | agentContractMetadataEffect, contractRecordEffect, contractArrayEffect, scopeMetadataEffect                                                                                               |
| generate-registry-support-calculations.ts | presenceTypeEffect, channelDocumentTypeCore, arrayRecordsCore, publicChannelsCore, publicAgentsCore, selectorCore                                                                         |
| generate-registry-support.ts              | isRecordEffect, channelDocumentTypeEffect, agentDocumentTypeEffect, arrayRecordsEffect, publicChannelsEffect, publicAgentsEffect, selectorEffect                                          |
| generate-registry-types.ts                | channelRegistryTypeEffect, agentRegistryTypeEffect, registryTypeEffect                                                                                                                    |
| generate-agent-procedure-fragments.ts     | unionEffect, procedureEffect, controlPayloadEffect, controlInputsEffect                                                                                                                   |
| generate-agent-procedures.ts              | agentProcedureEntriesEffect, agentProcedureEntriesFromDocumentEffect, entries, runInputs                                                                                                  |
| generate-agent-resume.ts                  | agentResumeTypeEffect, collectResumeTypes                                                                                                                                                 |
| generate-agent-contract-fragments.ts      | agentTypeUnionEffect, metadataTypeEffect, resumeTypeEffect, toolTypeEffect, stateTypeEffect, eventTypeEffect, scopeMemberEffect, scopeTypeEffect, waitingTypeEffect                       |
| generate-agent-contract-types.ts          | agentContractTypeEffect                                                                                                                                                                   |
| generate-job-source-calculations.ts       | supportedOperationsCore, stringArrayCore, recordKeysCore, sourceCore, exposedJobCore                                                                                                      |
| generate-job-sources.ts                   | sourceEffect, supportedOperationsEffect, stringArrayEffect, recordKeysEffect, isExposedJobEffect, isRecordEffect                                                                          |
| generate-job-procedure-sources.ts         | jobProcedureSourcesCore, jobProcedureSourcesFromDocumentCore                                                                                                                              |
| generate-job-procedure-entries.ts         | jobProcedureEntrySourcesCore                                                                                                                                                              |
| generate-job-procedures.ts                | jobProcedureSourcesEffect, jobProcedureSourcesFromDocumentEffect, jobProcedureEntriesEffect, jobProcedureEntriesFromSourcesEffect, jobProcedureEntriesFromDocumentEffect                  |
| generate-job-paths.ts                     | jobProcedurePathsEffect, jobProcedureDocumentEffect                                                                                                                                       |
| generate-job-type-calculations.ts         | jobFieldsTypeCore, jobFailureTypeCore, jobStreamItemTypeCore, jobSnapshotTypeCore, pageTypeEffect, watchFrameTypeEffect, streamFrameTypeEffect, triggerInputEffect, streamInputTypeEffect |
| generate-job-types.ts                     | jobProcedureEntrySourcesEffect, jobSnapshotTypeEffect, jobStreamItemTypeEffect, jobFieldsTypeEffect, jobFailureTypeEffect                                                                 |
| generate-job-registry-calculations.ts     | streamRecordTypeEffect, operationsTypeEffect, jobRegistryTypeCore, jobProcedureTypeEffect, jobClientRegistryEntriesCore                                                                   |
| generate-job-registry-contracts.ts        | jobProcedureContractEffect, jobStreamProcedureContractEffect                                                                                                                              |
| generate-job-registry-render.ts           | generateJobRegistryFromSources, generateJobRegistryCore, generateJobRegistryFromDocumentCore                                                                                              |
| generate-job-registry.ts                  | generateJobRegistryEffect, generateJobRegistryFromDocumentEffect, jobRegistryTypeEffect, jobClientRegistryEntriesEffect                                                                   |
| generator-operation.ts                    | makeGeneratorOperationEffect and its synchronous factory adapter                                                                                                                          |
| generator-graph-operation.ts              | makeGraphOperationEffect and its synchronous factory adapter                                                                                                                              |
| generator-observability.ts                | observeGenerator, observeLive, runGenerator, GeneratorTelemetry service and live Layer                                                                                                    |
| generate-type-syntax.ts                   | renderTypePropertyEffect, renderTypeObjectEffect, renderTypeUnionEffect, renderTypeApplicationEffect, renderTypeIntersectionEffect, renderReadonlyTypeTupleEffect                         |

The 32 .types.ts modules own the package's interfaces, type aliases, and
runtime modules' type-only imports. index.ts is a barrel. The
generate-job-type-fragments.ts module contains fixed type text only. Neither
has an executable operation to convert.

## Failure, service, lifecycle, and concurrency decisions

MissingRouteTarget is the tagged Effect failure for a graph trigger referencing
a missing function. Synchronous graph adapters preserve the established
TypeError message. InvalidClientContract is the tagged failure for malformed
serialized agent metadata. Unknown document values otherwise use existing
defaults; malformed trusted compiler data can defect, as documented on adapters.

GeneratorTelemetry is a substitutable Context service with a live Layer.
Public Effect operations and synchronous adapters use stable spans and bounded
operation, duration, and failure metrics. Internal pure calculations share the
observed parent operation to avoid duplicate counts. Tests provide a
deterministic telemetry Layer and assert successful and failed operations.

The generator computes deterministic strings and objects from in-memory
documents. It does not acquire listeners, timers, handles, or subscriptions;
there is no release owner or interruption cleanup path. It performs no
independent asynchronous IO, so Effect concurrency would add scheduling
without reducing latency and could change rendering order.

## Verification

The configured Vitest V8 run covers all authored executable source modules:
100% statements, 99.67% branches, 100% functions, and 100% lines across
53 passing tests. The two uncovered branches are the defensive client-disabled
fallbacks in contract and manifest rendering; those graph renderers receive
routes after client-disabled entries are filtered. All package tests live under tests/ and use Vitest.
The package runner and aggregate Vitest phase execute the same tests.

The package TypeScript build, repository typecheck and boundary check,
CLI pull regression tests, formatting check, and scoped konsistent check
passed. Repository-wide konsistent still reports 106 out-of-scope findings.
The focused generator run failed in concurrent acceptance additions: one
temporary graph artifact was missing and a Docker-profile reminder test timed
out. Both failing cases passed in isolation; its other two phases passed.
