# Retained pre-repair 17.19 E2E reproduction

> Historical evidence only. The run predates committed candidate
> `73a7e3c16e0add0fe4a984d450f1e1c65a4499be` and does not establish current
> candidate or Gate 16 approval.

Run date: `2026-08-19`
Bun: `1.3.10`

## Bootstrap

The historical command used the documented disposable bootstrap:
`@types/react@19.2.18` and `@types/node@26.2.0` were installed outside the
repository and linked into `apps/inspector/node_modules/@types`. The links and
temporary package directory were removed after the run; `package.json` and
`bun.lock` were unchanged.

## Command

```text
bun run test:e2e
```

## Result

```text
Running 6 tests using 1 worker
6 passed (14.4s)
```

The historical command exited `0`; the capture duration was `14.867s`. All six
inspector browser scenarios passed. Exact stdout, stderr, and result files are
`03-bun-test-e2e.{stdout,stderr,result}.txt` in this directory.
