# Optional flat layout migration

Flat `src/<name>/service.ts` applications remain supported. Migrate only when grouped placement helps the app. Preview from the application root:

```sh
bun run relkit migrate layout
bun run relkit --json migrate layout
```

The deterministic plan moves complete service roots to `src/services/<name>`, including helpers and assets. It reports import, test, tooling, documentation, and local guidance rewrites, conflicts, and references needing manual action. Preview leaves authored files, lockfiles, generated output, persistent state, migration history, and credentials unchanged.

Stop the app's active development session and resolve touched tracked changes, occupied destinations, mixed boundaries, symlinks, and ambiguous/computed references before applying:

```sh
bun run relkit migrate layout --write
```

Write stages the candidate with installed dependencies and requires baseline/candidate check, typecheck, logical graph, and offline deployment compatibility before publication. It does not install packages, run database migrations or seeds, provision providers, or edit global skills. Publication is coordinated across files; the restricted local receipt retains exact before/after bytes and permissions for failure or crash recovery. Keep that receipt private.

Rollback with the exact path returned by the write result:

```sh
bun run relkit migrate layout --rollback .relkit/migrations/RECEIPT_ID/receipt.json
```

Rollback refuses later edits or occupied original locations instead of overwriting them. Recovery conflicts preserve user bytes and require inspection of the retained receipt. Successful migration or restoration needs fresh preparation:

```sh
bun run check
bun run typecheck
bun run relkit dev --prepare
bun run dev
```

Compare actual application responses and durable runs after the move. Logical service/function/task/job/channel/agent IDs and versions remain unchanged; diagnostic and editor paths point at their real grouped sources.
