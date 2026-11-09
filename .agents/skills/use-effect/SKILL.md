---
name: use-effect
description: Implement new features, services, or modules and refactor existing code using Effect. Use when asked to write or refactor code with Effect.
---

# Use Effect

Accept a feature/task brief, a new target path, or an existing file or directory.
This skill covers new implementations, extensions, and refactors.

## Required workflow

The linked references are binding parts of this skill, not optional background.
All existing instructions, restrictions, and recommendations live there. Read
and apply each required reference before its phase; do not treat this entry point
as the complete instructions. Reuse references already read during the task.

| When | Required reference | Contains |
| --- | --- | --- |
| At task start, before discovery or edits | [Workflow and sources](references/workflow-and-sources.md) | Scope, contracts, source verification, prerequisite skills, precedence, execution, progress and delivery rules |
| Before implementing or changing runtime code | [Implementation standards](references/implementation-standards.md) | Services, Context, Layers, errors, observability, concurrency, lifecycle and function-size restrictions |
| Before writing, editing or documenting source files | [Code style and layout](references/code-style-and-layout.md) | File headers, callable contracts, comments, examples, spacing and type/schema placement |
| When planning validation, and again at final review | [Verification and completion](references/verification-and-delivery.md) | Behavioral tests, E/R checks, recovery, cleanup, instrumentation, review and required checks |

Apply the specific loading conditions and precedence rules in these references.
When guidance refers to the “main skill,” it includes these required references.
A reference move does not weaken a requirement or make it optional. Explicit
user instructions govern the requested scope and any authorized exceptions.

## Supporting references

Load these when their listed responsibility is in scope, following the more
specific requirements in the workflow reference. Do not preload unrelated topics.

| Responsibility | Reference |
| --- | --- |
| Domain Services or failure handling: read both before implementation | [Services and Context](references/services-and-context.md); [Errors and recovery](references/errors-and-recovery.md) |
| Concurrent work, fibers, signaling, queues, broadcast, shared limits or gates | [Concurrency and coordination](references/concurrency-and-coordination.md) |
| Runtime composition, callbacks, brands, matching or control flow | [Effect code style](references/effect-code-style.md) |
| Choosing Effect capabilities: read applicable sections | [API selection](references/api-selection.md) |
| Documenting code: read once, including file-header samples | [TSDoc and comments](references/tsdoc-comments.md) |
| Substitutable adapters or stateful/concurrent services | [Contracts and behavioral tests](references/contracts-and-testing.md) |
| Callbacks outliving registration, scoped workers, or durable/delayed work | [Lifecycle and durability](references/lifecycle-and-durability.md) |
| Scoped Drizzle integration | [Drizzle + Effect](references/drizzle-effect.md) |
| Scoped oRPC integration | [oRPC + Effect](references/orpc-effect.md) |
