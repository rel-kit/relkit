# ZSYS-DR-003: Discussion Record Governance

**Date:** 2026-08-06

**Status:** Accepted

**Owners:** ZSys maintainers

**Related records:** [ZSYS-DR-001](./2026-08-06-001-foundational-architecture.md), [ZSYS-DR-002](./2026-08-06-002-filesystem-structure-resource-addressing-and-deployment.md)

## Context

ZSys is expected to evolve through architecture, product, compiler, runtime, deployment, and ecosystem discussions. Decisions made conversationally can become difficult to reconstruct after code, plugins, or migration behavior depend on them.

A lightweight but durable record system is needed so humans and AI agents can locate the context, alternatives, current direction, consequences, and superseding decisions for each material discussion.

## Options discussed

### Option A: Keep only a continuously edited project brief

This is easy to read but loses historical rationale and makes it difficult to determine when or why a direction changed.

### Option B: Store raw conversation transcripts

This preserves all wording but is noisy, difficult to search semantically, and often lacks a precise decision statement.

### Option C: Maintain a current brief plus sequential discussion records

The brief summarizes the current direction. Each material discussion receives a compact, stable record with context, options, decisions, consequences, open questions, and follow-up actions.

## Decision or current direction

### D-019: Maintain two complementary documentation layers

- `docs/briefs/` contains dated snapshots of the current project direction.
- `docs/records/` contains stable records of material product, architecture, implementation, migration, and governance discussions.

### D-020: Assign every material discussion a stable sequential ID

The filename convention is:

```text
docs/records/YYYY-MM-DD-NNN-short-topic.md
```

The document title includes the corresponding stable identifier:

```text
ZSYS-DR-NNN
```

Sequence numbers are not reused, even when a record is rejected or superseded.

### D-021: Do not silently rewrite decisions after they become dependencies

Small factual or typographical corrections may be made and listed in the change history. A changed decision should normally be expressed in a new record that links to and supersedes the previous record.

### D-022: Keep a discoverable index

`docs/README.md` is the canonical human-readable index of briefs and discussion records. Generated documentation may later mirror the same metadata.

### D-023: Record material discussions, not routine operations

A new record is required when a discussion changes or meaningfully refines product scope, architecture, public conventions, compatibility, security, migration behavior, deployment behavior, plugin contracts, or governance.

Routine verification, typo fixes, packaging, and status checks do not require a new record unless they expose or establish a new decision.

### D-024: Make records useful to AI agents

Records should use stable IDs, explicit status values, resolvable relative links, predictable headings, and concise decision statements. A future index may expose the same information as structured JSON through the compiler or documentation tooling.

## Consequences

### Benefits

- Decisions remain attributable and reviewable over time.
- New contributors can understand why an architecture exists rather than only seeing its current implementation.
- AI agents can retrieve compact, authoritative context instead of relying on long transcripts.
- Superseding decisions and migrations become explicit.
- The current brief can evolve without erasing history.

### Costs and risks

- Records require discipline to create and index after each material discussion.
- Over-recording minor conversations could create noise.
- Under-recording implementation decisions could leave important behavior undocumented.
- Status and supersession metadata must be maintained consistently.

## Open questions

1. Should record metadata move to YAML front matter for automated indexing?
2. Should accepted records require named owners or reviewers?
3. At what point should records be validated by a documentation linter?
4. Should pull requests be required to reference related record IDs for changes to public conventions?
5. Should research source notes live in `docs/research/` separately from decision records?

## Follow-up actions

- Use [`_template.md`](./_template.md) for future material discussions.
- Update `docs/README.md` whenever a record is created or changes status.
- Begin the next material record at `ZSYS-DR-004`.
- Evaluate machine-readable front matter after the documentation set grows beyond the initial records.

## Supersedes

None.

## Superseded by

None.

## References

- [Documentation index](../README.md)
- [Discussion record template](./_template.md)

## Change history

- 2026-08-06: Initial governance record accepted.
