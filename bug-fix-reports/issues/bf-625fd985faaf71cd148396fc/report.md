# bf-625fd985faaf71cd148396fc: Investigate the silent disappearance of previously healthy e-commerce dev CLI55765.

Status: **not-reproduced**
Attempt: 1 · Updated: 2026-10-16T12:10:35+00:00

## What

Investigate the silent disappearance of previously healthy e-commerce dev CLI55765.

## Expected

The explicitly approved preview remains available until intentionally stopped, or retains a diagnosable termination result.

## Observed before

The former foreground tool session and its CLI were gone at the next live check. The app log ends in successful requests and has no shutdown diagnostic. Both owning and coordinating chats lack a retained tool exit result.

## Root cause

Not established. No retained exit status, native signal, sender, exact stop time, matching Bun crash report, or host kill event ties the historical disappearance to a specific cause. A separate prepared SIGHUP cleanup defect was reproduced and is tracked as bf-1672405f026d30b6cc3728eb; it is not proof that HUP caused this incident.

## Fixed by

Not reproduced: the original stop cannot be attributed to a specific signal or sender. The app is now running on verified fixed code in a detached owner with a retained native exit receipt; exact current metadata and business/integrity checks are in evidence/001/current-preview.json.

## Changed files


## Reproduction


## Evidence

- before: [integration](evidence/001/historical-timeline.json) — Sanitized original launch, last successful log, unavailable exit result, host observations and limitations.
- before: [integration](evidence/001/native-host-log-query.json) — Native host query bounded at18seconds; no complete kill audit available.
- after: [integration](evidence/001/detached-preview-live.json) — Unchanged detached CLI47312 at nice15, expected three-product catalog and healthy inspector.
- after: [integration](evidence/001/current-preview.json) — Final actual prepared preview69188, owner69187, live business data and full snapshot validation before/after HTTP requests.

## Scope

```json
{
  "modules": [
    "Dev CLI process lifetime",
    "Local foreground tool session"
  ],
  "entrypoints": [
    "bun run dev"
  ],
  "invariants": [
    "Historical evidence must not be relabeled as proof of a speculative cause",
    "Only owned processes may be stopped"
  ]
}
```

## Environment

```json
{}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "pending"
    },
    "after": {
      "status": "pending"
    }
  },
  "runtime": {
    "kind": "api",
    "boundary": "",
    "dependencies": [],
    "steps": [],
    "before": {
      "status": "pending"
    },
    "after": {
      "status": "pending"
    }
  },
  "e2e": {
    "status": "pending"
  },
  "checks": [],
  "regressions": [],
  "limitations": []
}
```

## Related reports

```json
[
  "bf-1672405f026d30b6cc3728eb"
]
```

## Notes

```json
[
  "Ordinary native TERM and HUP tests cleanly joined children with diagnostics, differing from the silent historical stop.",
  "Prepared HUP reproduction establishes a separate real defect. SIGKILL and external process-tree cleanup cannot be recovered from inside a killed CLI; neither was proven here.",
  "No commits, staging, cloud operations, app input changes, or unrelated process termination."
]
```
