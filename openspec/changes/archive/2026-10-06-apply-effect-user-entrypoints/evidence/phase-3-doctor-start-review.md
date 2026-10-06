# Phase 3 doctor and production start review

Status: closed. Independent reviewer: root; author: native_gate. The original 30 authored TypeScript files were read through EOF, including pure schemas/types, native fixtures and strict consumer probes. The table below preserves that review snapshot; the final 31-file current hash overlay is in `phase-4-native-review-files.json`.

The later startup compatibility delta was independently read through EOF by root and the generator reviewer: start-built-workflow.ts restores the established built-version diagnostic before complete manifest validation; start-process.service.ts consumes only owned ReadableStreams, preserving inherited native output; compatibility.test.ts verifies the inherited-stream seam. The affected built-version test, real product runtime test, controlled compatibility test and strict consumer compilation all passed. No finding remains in this delta.

Review applied use-effect and repository Effect guidance: explicit Context requirements, owner-validated Schema promotion, captured capabilities, scoped processes/listeners/HTTP bodies, finite TERM/KILL/reap and output deadlines, idempotent Ref/Deferred completion, readiness cancellation and retained full cleanup causes. No caching is appropriate for these finite commands. Public positional errors, JSON/status policy and manual handles retain their original contracts.

Findings closed: readiness rollback must retain the original caller abort; listener probes must record release failures; manual owner evidence must be captured after runtime disposal. Native fault injection proves identity preservation and non-enumerable diagnostic storage when termination fails. Cleanup rejections remain separately inspectable through cliCleanupFailures.

Independent verification: `bun x --bun vitest run packages/cli/tests/start-doctor/{domain,observation,type-probes}.test.ts --maxWorkers=1` passed 10/10. `bun run packages/cli/tests/start-doctor/native.acceptance.ts` passed all four actual Bun process scenarios. Final source typecheck passed before the unrelated contributor launcher was authored. Author strict test-body compilation also passed with skipLibCheck false.

Installed stable 4.0.1 Context/Scope/Ref/Deferred/Effect/Cause implementations and embedded examples were inspected. The ignored vendor checkout lacks several matching core files; installed sources and exact-version upstream tests provided the documented fallback.

| File | SHA-256 |
| --- | --- |
| packages/cli/src/commands/doctor-checks.ts | 227e2ba509966693ee8ff854c23c0af803e58858e3455aab9d9d8f716e937c03 |
| packages/cli/src/commands/doctor-compat.ts | 3bf6303020a8de23041b1c23415a6d0171ace541a1924d7cffe7d88332ba5f75 |
| packages/cli/src/commands/doctor-config.ts | 56e3c7310ecaf318b1dde84acd50bd1efff3ac8bdf2894d44d0f4ba002301c09 |
| packages/cli/src/commands/doctor-error.ts | 572bd9ecca98d7eadd7a10030d41f29c06efa25fb8496fcbabbef874828b60ef |
| packages/cli/src/commands/doctor-native.ts | d0d91782b0b20a3514c87dac55af863599653d320700e4a8e9c444664fff0a0b |
| packages/cli/src/commands/doctor-project.service.ts | 8030525f2e073d0026234de9aea6b93f2b9358f7e3a8971b45e53f0c7a51c90d |
| packages/cli/src/commands/doctor-roots.ts | 692594c909ff2f709074c688a99744ef941e264369fe2ea4c2ed585cd702c7f1 |
| packages/cli/src/commands/doctor-support.ts | 0859152fa5974804a6e402a5916b9a01bac90f4dbad50cd6fd48a07bd256b7b8 |
| packages/cli/src/commands/doctor-toolchain.service.ts | e026807b21b8ec2f2b6bb26601276fd10749d3018bd44ea12f1914416f3f2867 |
| packages/cli/src/commands/doctor-toolchain.types.ts | 71f34573b64fc00169093d317c98cc65126930acaab2e03e85ab9ca63a7ce1c5 |
| packages/cli/src/commands/doctor.schemas.ts | 1705375f4041070def9e708bb99445839ef8cc0878c92f9d6918ec070e99a302 |
| packages/cli/src/commands/doctor.ts | 542a85e94e577caabbba220b4f83f9c7d6caa15d3501555b15eb710810727cb1 |
| packages/cli/src/commands/doctor.types.ts | 16a1c6d0423b4c0346b72311c8b95e73d7a03e2218c65305a3fc6277cb422411 |
| packages/cli/src/commands/start-built-validation.ts | e4468d0c60387da4e7ff088bc8418dd8c46c955eb97a2fd70ba3486bf1c1301a |
| packages/cli/src/commands/start-built-workflow.ts | 740f29233e1bdf516b7857f298d819e65a8ab0fb371ee3742817b9a720d86010 |
| packages/cli/src/commands/start-built.schemas.ts | 536fc2ff512d39acfa8c2f76144fc813c1fa616aaac71e527c5d9accf21ebef7 |
| packages/cli/src/commands/start-built.ts | 742026c2be5fad95b2e453fcc46cbeb2fa021baef69a4481e759af021fceaab3 |
| packages/cli/src/commands/start-built.types.ts | f9ce3b262bada48f7888987f4e1e5ad21b100623e8cac647c498ff12aa88fbd5 |
| packages/cli/src/commands/start-health.ts | 8acd8ba36a7ddd71e6460b7941c80872d331730e770ff24cbbdc0a97203097b9 |
| packages/cli/src/commands/start-native.service.ts | 86b609cf399f32346ab29b757802c4c17c91f5e9f8ef76b502df8f3b81e4cbdd |
| packages/cli/src/commands/start-process.service.ts | 7dc5291ad85a2ded19e655fa65161a900b095c0a19cbadc1121885532a4e3255 |
| packages/cli/src/commands/start-process.types.ts | 47e3b15f8ee7aa3ae192711c9e4ade4d9d19c4c4174bfe7e361b8bf388c45842 |
| packages/cli/src/commands/start.service.ts | a38c11315eb79e4e3cf4196115619e5b4f892e957c2de3b742f9fbf9e7a5c2fb |
| packages/cli/src/commands/start.ts | f77f5093d82f76a99e0669999276c434a4524564529dbec4ded07e241fd93fe1 |
| packages/cli/src/commands/start.types.ts | 83d2ec4100b42af4f42a1fca1edc22afd0c61a280b20abbbb1f474e3509e83f0 |
| packages/cli/tests/start-doctor/domain.test.ts | 2c8316ee6de73222ab6e24298bef024299c8f58f116ae672696cc641f97f8fd4 |
| packages/cli/tests/start-doctor/native-fixture.ts | a5df44fabb0d97b97630b1303e73e8e40dc49935561aa6e329b27a3f96c88ae6 |
| packages/cli/tests/start-doctor/native.acceptance.ts | 3ba685a1cb147f9d1c063069514ae1dee524bcf5867ee5839fa805bf55898cd0 |
| packages/cli/tests/start-doctor/observation.test.ts | cf1d1765f6571662dca44abd2184c25313f617f57e7538743d0a70269e2ae37d |
| packages/cli/tests/start-doctor/type-probes.test.ts | 3622e19aa63b696fb375b6d3eadc503bfd99860d085ae80c06c474ebb8b2a9d8 |
