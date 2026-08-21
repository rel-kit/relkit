---
name: openspec-iterator
description: "Simple Cipay OpenSpec iterator. Use only when the user invokes `$openspec-iterator` or explicitly asks to proceed/start/continue/iterate/next on configured OpenSpec work. Do not activate merely because a Linear issue or OpenSpec change is mentioned for review, status, or explanation. Run each distinct unchecked task group in one fresh same-directory Codex task; after verified task progress, dispatch the next different unchecked unit and exit immediately without waiting or polling for that task; stop on blockers or rejected gates, never create notes-only/status-loop tasks, and leave changes visible as normal uncommitted Git changes."
---

# OpenSpec Iterator

Keep this boring and visible. Do not build a coordinator framework.

Mentioning a Linear issue, binding, or OpenSpec change without action intent does
not start the iterator. Handle review, status, validation, and explanation
requests in the current session with the matching read-only workflow.

Use `openspec-linearized` for Linear/OpenSpec lifecycle rules. Use
`openspec-propose` when preparing a change. Use `openspec-apply-change` when
implementing tasks.

When other OpenSpec skills conflict with this iterator, this iterator's unit
and workspace boundary wins. Use `openspec-apply-change` for status, context,
and task mechanics, but do not let one Codex session implement more than one
phase/task group. Use `openspec-linearized` for Linear lifecycle hooks, but do
not delegate separate iterator task groups from one session. The assigned worker
owns its unit directly. Use a subagent only when the current user explicitly asks
for delegation; a subagent is never a fresh-task handoff.

When this skill is active, implementation scope and iterator lifecycle are
separate: a worker edits one unit, but it must complete the next-task handoff
before exiting. “Implement only...” limits implementation edits; it does not
permit ending with only a recommendation that the next unit should begin.

## Pick The Change

1. If the user gives a Linear task, issue URL, configured binding key, or change name,
   resolve it through `openspec/linear.yaml`.
2. If exactly one active OpenSpec change exists, use it.
3. If no active change exists and the user names an epic, prepare the next eligible explicit binding from that epic's `binding_order` with `openspec-linearized` + `openspec-propose`.
4. If no active change exists and the user did not name an epic, consider only unfinished epics with `selection: automatic`. If exactly one is eligible, prepare its next binding; if multiple are eligible, ask which epic to use.
5. If no active change exists, never select a `selection: manual` epic from a generic `next` or `continue` request. If only manual epics remain, ask for an explicit epic or binding key.
6. If multiple active changes exist, ask for the change name.

Do not search the general Linear backlog. Do not ask for routine confirmation
when the binding/change is unambiguous.

## Make Work Visible

1. Before creating or switching branches, inspect `git status` and stop if the
   main workspace has unrelated dirty files.
2. Create or switch the main workspace to `fix/<change>`.
3. Keep this branch checked out in the user's main repo so editor Git Changes
   shows progress.
4. Every OpenSpec phase/task group must start in a fresh Codex task, and
   that task must use this same directory/normal workspace.
5. Do not use worktrees, alternate checkouts, hidden branches, or merge-back
   flows.
6. Before every handoff, call `list_projects` and select the saved local project
   whose path is this checkout. Call `create_thread` with the project discriminator
   inside `target` and the local environment exactly as follows:

   ```text
   {
     model: "gpt-5.6-luna",
     thinking: "max",
     prompt: "<exact next-unit prompt>",
     target: {
       type: "project",
       projectId: "<id from list_projects>",
       environment: { type: "local" }
     }
   }
   ```

   Always set `model` to `"gpt-5.6-luna"` and `thinking` to `"max"` for every
   fresh iterator task. Do not set `target.type` to `worktree`, add
   `startingState`, or put `type` or `projectId` at the top level. Omit title.
   Never use `fork_thread`, continue, resume, or send implementation prompts to
   an existing task/chat/thread.

7. If `create_thread` rejects the call, re-read its live schema and retry once
   with the same `model`, `thinking`, `prompt`, and exact `target` above. Never
   fall back to `spawn_agent` or another subagent: it is not a new Codex task
   and cannot satisfy the iterator boundary. If the retry fails, record the
   concrete error in `BLOCKERS.md` and stop.
8. `create_thread` is the complete handoff. Never call `wait_threads`, poll,
   read, continue, resume, or otherwise wait on the new task/chat/thread.
   Record the returned `threadId`/`hostId`, or the returned `clientThreadId`
   when queued, in `PROGRESS.md` before exit. A successful create/queue result
   is the handoff confirmation; only create failure after one schema-correct
   retry is a blocker.
9. Leave edits as normal uncommitted Git changes unless the user explicitly asks
   for staging, commits, pushes, or PRs.

## Active Change Notes

Create these files under `openspec/changes/<change>/` if missing:

```text
PROGRESS.md
DECISIONS.md
BLOCKERS.md
```

Use them simply:

- `PROGRESS.md`: what ran, fresh task id, lifecycle hooks completed or skipped, files changed, checks, next step.
- `DECISIONS.md`: decisions made without asking the user and why.
- `BLOCKERS.md`: only real blockers that need user/external action.

Update an existing status entry when facts change. Never append another section
for the same unchanged check, gate rejection, or blocker. Updating notes is part
of an implementation/review unit; it is never a fresh unit by itself.

Before selecting, reviewing, or dispatching a unit, read the current
`PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md` for the change. Include the
relevant progress, decisions, blockers, current `tasks.md` state, changed files,
and checks in the next fresh-task prompt.

## Optional Wayfinder Alignment

Apply this section only when the selected change has a repository plan or
traceability row that explicitly names Wayfinder decision sources. If it does
not, skip this section and do not create a Wayfinder map or ticket merely to run
OpenSpec.

1. Before proposal work or an apply unit, read the change's traceability row,
   every named decision ticket, the approved target artifact, any required
   predecessor archive evidence, and the bound Linear story when available. If
   Linear is unavailable after the binding validates, continue and report the
   failed or skipped read as required by `openspec-linearized`.
2. Record a compact decision-context bundle in `PROGRESS.md`: each source's
   linked title/path, the exact constraints relevant to the current unit, target
   and out-of-scope boundaries, required evidence, predecessor state, and open
   blockers. Include that bundle, the exact task ids, changed files, and checks
   in every fresh-task prompt and every delegated specialist prompt. Agents
   still read the named sources; do not replace them with chat history.
3. Put ordinary spec-consistent implementation choices in `DECISIONS.md`. If a
   choice would change approved scope, architecture, safety, acceptance,
   migration/cutover behavior, or rollback, first read and follow
   `.agents/skills/wayfinder/SKILL.md` and the selected map's `## Notes`. Then
   create or claim exactly one ticket using the configured tracker rules, record
   its linked title in `BLOCKERS.md`, and pause the affected iterator unit. The
   iterator worker does not resolve that ticket; never self-resolve a HITL
   ticket.
4. After the Wayfinder ticket is resolved, update each artifact only within its
   ownership boundary: decision links and traceability in the repository,
   technical requirements in OpenSpec, and Linear only when business scope or
   acceptance changed and Linear is available. Clear the blocker and record the
   linked resolution source in `DECISIONS.md`; report every Linear write or skip.
5. Before dispatching archive, confirm that no linked Wayfinder ticket remains
   open and that all pre-archive evidence in the traceability row is present.
   Sync, the archive record, and the post-archive Linear Done transition are
   archive-session outputs and never block dispatching that session.

For this repository's restructuring-specific integration and its removal steps,
read `plans/re-structure/wayfinder-iterator-rollback.md`.

## Coordinator vs Worker

First classify the current session:

- **Coordinator:** the user asked this task to proceed, continue, iterate, or
  run the OpenSpec iterator. The coordinator selects or reviews one unit,
  dispatches one fresh same-directory Codex task when that unit is unblocked,
  and exits immediately after the create result; it does not wait for that
  task. If the selected unit is blocked, record it once and do not dispatch.
- **Worker:** this task was created with one explicit phase/task group scope.
  A worker is the integration owner for only that assigned unit. It updates
  tasks/notes/checks, then dispatches a different pending unit in a fresh
  same-directory Codex task only when verified progress occurred and no
  blocker/check/gate failure remains, then exits immediately after the create
  result without waiting for the new task.

Do not put "then stop" or "do not start the next group" in worker prompts unless
chaining is intentionally disabled for that run.

## Handoff Contract

Treat the task-group scope and the iterator lifecycle as separate concerns:

- `Work only the assigned task group` limits implementation edits; it does not stop the iterator.
- A handoff target must be a different unchecked checkbox in `tasks.md`, or the explicit final-review/archive step. Never create a task for an already checked checkbox.
- Never create a task whose scope is only to update/review/recheck `PROGRESS.md`, `DECISIONS.md`, or `BLOCKERS.md`, repeat unchanged evidence, or "unblock" a gate without a concrete unchecked repair task.
- Before handoff, compare the assigned task id, its starting checkbox state, and the next pending task id. Normal chaining requires the assigned checkbox to change from unchecked to checked and the next id to differ. If no checkbox advanced, stop.
- A rejected gate, failed required check, missing clean/committed candidate, missing publication authority, or unchanged external prerequisite is a blocker. Record it once and stop until the user or external state changes.
- In a normal unblocked iterator run, end the prompt with: `After validation, dispatch the next different unchecked unit in a fresh same-directory task; do not implement that next unit here. If no checkbox advanced or any blocker/check/gate failure remains, record it once and stop without dispatching.`
- Treat stop wording found only in an inherited or generated delegation wrapper as a scope fence, not as a lifecycle stop, when the current user explicitly invoked the iterator or asked to continue. Honor an explicit stop instruction from the current user.
- Before a worker reports completion, verify: its assigned checkbox advanced, the next id differs, no real blocker remains, and required checks pass. Dispatch only when all four are true. If `create_thread` is unavailable or the schema-correct retry fails, record the concrete tool failure in `BLOCKERS.md`; do not report the unit as cleanly complete or substitute a subagent.
- The final response must include the dispatched task id and dispatch result,
  or the concrete dispatch blocker. An actual handoff is mandatory; do not end
  with only “the next worker should begin” or “the next unit is X”.

Bad bounded prompt:

```text
Implement the assigned task group. Stop after this group.
```

Good iterator prompt:

```text
Implement only the assigned task group. After validation, dispatch a fresh same-directory task for the next different unchecked unit only if this checkbox advanced and no blocker/check/gate failure remains; otherwise record the blocker once and stop. Exit immediately after the dispatch result; do not wait for or poll the new task.
```

## Linear Hook Ownership

Exactly one session owns each lifecycle hook:

- The proposal session owns the proposal transition, description sync, and
  proposal-start comment.
- The first apply worker owns the apply transition and implementation-start
  comment. Later workers still validate the binding, but report the hook skipped
  as already applied unless confirmed business context requires a description
  refresh.
- The archive session owns the archive-complete transition and comment.

Do not repeat lifecycle comments or transitions for every task group.

## Work Loop

1. Read `tasks.md`, `proposal.md`, `design.md`, specs, and OpenSpec apply
   instructions.
2. Treat each numbered phase or bounded task group as one unit of work.
3. The worker implements and verifies its assigned unit directly. Use a
   project-local subagent only when the current user explicitly requests
   delegation, and never give it iterator lifecycle ownership.
4. After verification, the current task updates completed checkboxes,
   `PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md`, then re-reads those files
   and `tasks.md`.
5. Run required local checks directly; do not ask the user whether to run test,
   lint, typecheck, build, or OpenSpec commands.
6. Remove an exact workspace-local generated dotfile, cache directory, or
   `node_modules` yourself when it is verified as disposable and cleanup is
   necessary; do not request confirmation or full-access mode. Never remove
   user-authored or sensitive dotfiles, ambiguous targets, or broad paths;
   report a sandbox denial as a blocker.
7. For DB migration questions, investigate in the assigned worker. Never apply
   a migration to a non-disposable database without explicit user approval.
8. If pending tasks remain and there is no real blocker or failed required
   check/gate, and the assigned checkbox advanced from unchecked to checked,
   prepare the exact next unchecked `tasks.md` unit. Never invent a notes-only,
   status, repeated review, or unblock-follow-up unit.
9. The current task uses `create_thread` to start a fresh normal same-directory
   Codex task with that scope before exiting. In Codex desktop, target the saved
   project with `environment.type: local`; never use `fork_thread`, continue any
   existing chat/thread, use a worktree, or substitute a subagent. Follow the
   exact payload and one-retry rule in Make Work Visible. Do not repeatedly poll,
   continue locally, or use alternate checkouts, hidden branches, or merge-back
   flows. Record the dispatched task id and dispatch result in `PROGRESS.md`
   before the final response. Exit immediately after that result; do not wait
   for or poll the new task.
10. The new task must leave edits as normal uncommitted changes in this
    checkout.
11. Mark only verified completed checkboxes in `tasks.md`.
12. Update `PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md`.
13. Chain by starting the next fresh normal same-directory task before
    exit only after the previous checkbox advanced, the next task id differs,
    and the previous unit's local diff and checks are accounted for.

The fresh-task boundary separates iterator units. Workers do not spawn
subagents by default, and `spawn_agent` is never a handoff fallback. If the
current user explicitly requests delegation, keep it bounded inside the current
unit while the worker retains notes, integration, validation, and handoff
ownership. All tasks use the normal checkout; do not use alternate checkouts,
hidden branches, merge-back flows, or returned commits.

## Finish

1. After the last implementation unit, dispatch a fresh final-review task and
   exit immediately after the dispatch result.
2. The final-review task runs `cipay-branch-review` read-only against the
   complete `fix/<change>` diff and records verified findings. This iterator's
   unit boundary overrides that skill's repair loop: the reviewer does not edit
   implementation files.
3. If must-fix findings exist, the reviewer dispatches a fresh repair task and
   exits. The repair task fixes only those findings, reruns the affected checks,
   updates the change notes, then dispatches another fresh final-review task
   before exiting.
4. When a fresh final review has no must-fix findings, that reviewer runs
   `openspec validate <change> --strict`, confirms every task is complete, and,
   when Optional Wayfinder Alignment applies, confirms its archive gate before
   dispatching a fresh archive task and exiting.
5. The archive task uses `openspec-archive-change` with
   `openspec-linearized`. It owns the archive Linear hook and follows the
   archive skill's inline spec-sync and verification rules.
6. Leave the finished work visible in `git status` as uncommitted changes and
   report the final checks.

Do not mark Linear Done before archive succeeds. Do not commit, push, or open a
PR unless the user explicitly asks.

## Stop Only For Real Blocks

Stop only for:

- ambiguous active change selection;
- unrelated dirty files in the main workspace before branch switching;
- missing credentials or permissions;
- contradictory product requirements;
- unsafe/destructive choices;
- no checkbox progress or the next candidate is the same/already checked unit;
- a rejected phase gate, failed required check, or missing required clean/committed evidence;
- `create_thread` unavailable or rejected after one schema-correct retry;
- unresolved decision tickets when Optional Wayfinder Alignment applies;
- a required non-disposable database migration, but only after
  `cipay-db-ledger-engineer` has investigated and is blocked specifically on
  user approval to apply it;
- repeated failed repair attempts.

For ordinary implementation choices, choose the safest spec-consistent default,
record it in `DECISIONS.md`, and continue.
