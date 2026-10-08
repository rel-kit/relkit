# Pure parser definition implementation

Author: native_gate. Coordinator independently reviews this disjoint cleanup, including retained
foundation stable-path imports. The implementation keeps Clack in prompt execution and Effect CLI
in declarative parsing; these definition leaves acquire no domain resources.

## Complete author coverage

`packages/cli/src/cli-command.ts`, `cli-command-add.ts`, `cli-command-basic.ts`,
`cli-command-client.ts`, `cli-command-deploy.ts`, `cli-command-groups.ts`,
`cli-command-jobs-runs.ts`, `cli-command-jobs.ts`, `cli-command-local.ts`,
`cli-command-shared.ts`, and new `cli-command.types.ts`: eleven TypeScript files.
All are classified as pure parser construction, metadata mapping or callback serialization.
`cli-effect-runtime.ts` is excluded and retains the separate CLI author's ownership.

Every named helper documents purpose, parameters and results. Command/flag generic contracts are
retained by inference; shared documentation never widens service/error channels. Named callback
and dynamic parameter contracts live in the type companion, with the existing shared type export
preserved. Metadata-driven add parsers no longer need redundant parameter casts. Dynamic simple
jobs fields are typed optional string flags, replacing the `fields as never` input erasure. The
definition-list parser directly constructs the same three string flags rather than indexing an
unbounded factory array. Existing choice validation, aliases, repetition limit, optional positionals,
port bounds, key sorting and argument order remain unchanged.

No artificial Context service, Scope, fiber, Cache/RcMap or Ref is introduced for pure construction.
Integer input uses Effect CLI's existing Schema.Int primitive. Literal choices use its native
choice primitive, preserving its matched validation and inferred output rather than adding an
unrelated replacement validator.

## Effect compatibility review

Inspected installed 4.0.1 Command.make/withSubcommands, Flag constructors, and Param optional,
integer and literal implementations plus embedded provisioning examples. Inspected ignored vendor
`test/cli/Param.test.ts` optional behavior, `test/cli/Command.test.ts` parent/subcommand behavior,
and `typetest/cli/Command.tst.ts` required-service/error union and parent-input preservation.
Vendor optional implementation differs from installed source; installed 4.0.1 remains the API
authority. Vendor files were read only.

## Actual verification

- `rtk bunx tsc -p packages/cli/tsconfig.json --noEmit`: passed without diagnostics after typed
  parser cleanup (subsequent changes are documentation only).
- `rtk bun test packages/cli/main.test.ts packages/cli/scaffolding.test.ts`: **12/12 passed**,
  covering human/JSON help/version/usage, every nested help path, argument forwarding and scaffold
  compatibility. Log `/tmp/relkit-cli-parser-tests.log`.
- Focused Prettier check and repository diff whitespace check passed before the final documentation
  formatting pass; implementation files remain below 250 lines.

Full integrated release/demo checks and unstaged synchronization remain coordinator acceptance
responsibilities and are not claimed by this author evidence.
