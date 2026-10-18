# Independent guidance fixtures: ready for parent execution

Both concrete cases are authored. This child has run no tests, builds, typechecks, installs, servers or browsers in this follow-up phase. There are no runtime pass/fail results yet. Parent explicitly requested source authoring while serializing acceptance.

Each case includes the literal REQUEST.md, actual RESPONSE.md plan, before/app source trees, changes.diff and file-actions.json. baseline-hashes.json and authored-hashes.json identify their actual bytes. preserved-bytes.json records only observed filesystem equality, not behavior.

## Existing SQLite and Better Auth

case01/app adds GET /users/me and GET/POST /orders through separate resource services. It validates SKU and integer quantity, derives ownership from the trusted session and filters lists by that owner. The auth helper is exported through the existing auth boundary. Existing auth mount/schema, database factory, notes table, environment declarations and Drizzle patch/registration are preserved.

Finite test source: case01/app/tests/integration/auth-orders.test.ts. It uses real Better Auth cookies for two users with an isolated SQLite file and the in-process HTTP application harness. Intended assertions cover anonymous denial, invalid input, owner spoofing, scoped lists, real session revocation, persistence after closing and a preserved existing notes row. Native auth environment is explicitly set/restored and owned database/application resources close in finally. These assertions have not executed.

Copy the entire case01 tree when staging elsewhere because the finite test reads sibling fixture-sql files. Those are explicit fixture seed SQL, not claimed generated Drizzle metadata or a completed migration.

For full migration acceptance: stage before, run installed db:generate, review/apply to an isolated database, overlay final source while preserving generated history, then generate/review/apply the extension. Keep the copied Drizzle patch and patchedDependencies entry throughout. No migration ran during authoring.

The in-process HTTP test does not establish production network middleware or cookie/origin policy. Verify those on a parent-owned backend before full acceptance.

## Explicitly selected fullstack

case02/app adds a labelled name form to its existing greeting page. The existing useRoute query receives the submitted name; same-name submission refetches for retry. Backend/form validation is nonblank and at most 80 characters. Loading/disabled/error feedback is included. Existing information section, provider wrapper, layout/header/footer and Next withRelkit adapter remain.

Finite HTTP source: case02/app/tests/integration/greeting.test.ts.
Finite browser source: case02/app/tests/browser/greeting.spec.ts.
Playwright config uses one worker and never starts servers automatically.

The browser test waits for an actual successful backend response containing Hello, Ada!, checks the displayed result, blank-name disabling, a controlled backend failure/retry, preserved content/wrapper and mobile control visibility. It has not executed.

FULLSTACK_BASE_URL sets the browser page origin, RELKIT_API_URL identifies backend response origin, and NEXT_PUBLIC_RELKIT_API_URL configures the preserved provider at frontend startup. Defaults: frontend http://127.0.0.1:3001, backend http://127.0.0.1:3000. Start API and frontend separately when resource-constrained; the package also retains a parallel convenience dev script.

## Pending commands

From staged app roots after compatible dependencies are available:
- bun run check (generates typed database context/client registry)
- bun run typecheck
- case01: bun test tests/integration/auth-orders.test.ts --timeout 30000
- case02: bun test tests/integration/greeting.test.ts --timeout 15000
- Applicable build commands and case01 migration sequence above
- Owned backend HTTP verification and case02 one-worker browser acceptance, followed by process cleanup

These are pending commands, not an execution transcript. Fixtures currently have no node_modules, lockfile or generated output. Parent may stage/link its compatible local packages and use bounded current tools. No application process was started by this child.

MODEL.md distinguishes parent-reported inherited gpt-6.1-sol metadata from absent independently inspected child identity. skill-source-hashes.json identifies the current source skill/references.

Only this owned evidence directory changed; no monorepo production source was edited.
