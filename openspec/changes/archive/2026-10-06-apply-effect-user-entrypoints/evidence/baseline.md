# Phase-one baseline

- Started 2026-10-05 16:21 UTC; original checkout clean at e081bde6054c8395209cdec145d8217c5d9c0dfd.
- Candidate: /Users/mustafaelsayed/.codex/worktrees/effect-user-entrypoints/relkit.
- Frozen install in candidate: passed on Bun 1.3.10, 2715 packages, 7.22 seconds.
- OpenSpec strict validation: passed.
- Original checkout phase-zero suite: 28 passed, 0 failed, 127.49 seconds.
- Original checkout full generator baseline: exit 1 from a 5-second concurrent timeout in reused Docker profiles reminder. Other groups finished; this command is recorded as failed.
- Original checkout isolated reminder test: passed, 3.58 seconds; establishes the affected behavior succeeds without competing groups, not that the failed full command passed.
- Regression demo Git status clean; executor OPENAI_API_KEY absent (no secret value inspected).
- Independent phase-one review: phase-1-review.md; 57 generator + 150 CLI files confirmed and zero changed TS files at that boundary.

## Demo baseline before candidate linking

Original framework links remained active for these checks on 2026-10-05:

- `bun run check`: passed.
- `bun run typecheck`: passed.
- `bun run test`: 12 passed, 0 failed across 11 files, including the retained agent fixture.
- Snapshot original demo and agent fixture manifests, lockfiles, installed symlink targets, and global Bun registrations before temporary candidate linking. The restoration snapshot is private temporary execution data; it contains no environment or credentials.
- Live, Inspector, graph, AI, and disconnect replay still requires the integrated candidate; the paid Luna replay also requires the fresh execution credential requested from the user.
