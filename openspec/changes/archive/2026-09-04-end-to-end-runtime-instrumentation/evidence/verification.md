# Runtime instrumentation verification evidence

Recorded on 2026-09-03 with Bun 1.3.10 on macOS.

- `bun run verify` passed in its fixed fail-fast order, including formatting,
  lint, boundaries, source-size limits, build/no-diff, typecheck, type fixtures,
  package/unit/compiler/contracts/integration/restart/Inspector/MCP/generator,
  executable examples, documentation, release readiness, secret scanning,
  security/redaction, public declarations and agent boundary scans.
- Package coverage passed with 563 tests and one opt-in skip. Integration passed
  with 45 tests and one opt-in skip; restart passed with 7 tests; generator
  passed with 20 tests; Inspector API passed with 5 tests; security passed with
  2 tests.
- `bun run test:inspector:browser` passed the paused live-request, selected-span,
  continuation, reconnect and truncation browser acceptance.
- `openspec validate end-to-end-runtime-instrumentation --strict` and
  `git diff --check` passed.
- React Doctor changed-scope analysis scored 92/100. Its two remaining warnings
  are control-flow complexity in the existing Inspector detail/waterfall render
  components; no correctness, accessibility or safety issue was reported.

The local Redis/MinIO Docker test remained skipped because its opt-in
`RELKIT_TEST_DOCKER=1` environment was not enabled. The paid AWS deployment test
was not run because cloud execution was explicitly excluded; mocked AWS
transport round-trip coverage passed in the local suites.
