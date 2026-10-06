# Help and editor author evidence

Author: coordinator. Independent reviewer: native-gate author, pending its runtime authoring milestone.

The nine help modules remain pure static metadata and render helpers. Help can run synchronously before any application or command service is acquired. Named contracts now live in `cli-help-model.types.ts`; `cli-help-types.ts` remains a type-only compatibility barrel. Command descriptions, options, ordering, and JSON metadata are unchanged.

The editor entry remains synchronous and loadable by TypeScript's CommonJS plugin loader. Its editor-provided TypeScript contract lives in `editor.types.ts`. Language-service methods continue reading the host's unsaved snapshots, forwarding their original receiver, and leaving disposal with the host. No Effect runtime or asynchronous service acquisition is appropriate for these pure hooks. Native loader tests remain Bun/Node tests; their constructor type now comes directly from the authored plugin rather than a duplicate or untyped shape.

Changed/new TypeScript coverage requiring independent review:

- `packages/cli/src/cli-help-add.ts`
- `packages/cli/src/cli-help-builders.ts`
- `packages/cli/src/cli-help-client.ts`
- `packages/cli/src/cli-help-jobs.ts`
- `packages/cli/src/cli-help-model.ts`
- `packages/cli/src/cli-help-model.types.ts` (new)
- `packages/cli/src/cli-help-options.ts`
- `packages/cli/src/cli-help-system.ts`
- `packages/cli/src/cli-help-types.ts`
- `packages/cli/src/editor.ts`
- `packages/cli/src/editor.types.ts` (new)
- `packages/cli/editor.test.ts`
- `packages/cli/editor-compatibility.test.ts`

Verification:

- Focused formatting check passed.
- Actual editor packaging through `bun scripts/package-editor.ts` passed.
- Native packaged editor tests: 4 passed, 0 failed, 6.43 seconds. Coverage includes Node's TypeScript plugin resolver, unsaved route errors/code fixes, fixture exclusions, and dynamic-route input recovery using the editor's TypeScript.
- Focused help/main command tests: 7 passed, 0 failed, 3.74 seconds. Current help tests assert every command's actual descriptions, options, and examples. A follow-up Vitest snapshot refresh removed the obsolete snapshot file (no test used it); all 7 tests passed again with no assertion removed.
- Isolated strict help/editor source typecheck with `skipLibCheck: false` and `exactOptionalPropertyTypes: true`: passed, no diagnostics.

The authored getting-started guide now describes the minimal default and only missing-name/final-confirmation prompts, with explicit `--template api` for the Orders tutorial. Full creation behavior is verified by the generator author and combined acceptance gates.
