# bui-d4579e5f46ee02dffd7be479: The documentation sidebar repeats the overview and hides common sections; the docs brand lacks the landing logo.

Status: **verified**
Attempt: 1 · Updated: 2026-10-25T12:58:25+00:00

## What

The documentation sidebar repeats the overview and hides common sections; the docs brand lacks the landing logo.

## Expected

One overview link, persistent common links, expandable section sublinks, and the landing RELKIT mark.

## Observed before

At /docs, both Documentation and RELKIT documentation link to /docs; the tutorial shows only Learn links, and the header has no logo.

## Root cause

apps/docs/blume.config.ts used navigation.tabs, which scopes Blume's sidebar to the current section. The generated tree linked folder index pages through both group headings and child rows. The configuration omitted logo.

## Fixed by

Use the existing catalogs to build one explicit nested Blume sidebar, linking each overview only from its group heading. Configure persistent Home, Documentation and GitHub links, and reuse /logo.svg.

## Changed files

- apps/docs/blume.config.ts
- apps/docs/scripts/generate-navigation.ts
- apps/docs/browser/docs.spec.ts
- apps/docs/browser/navigation.spec.ts
- apps/docs/tests/navigation.test.ts

## Reproduction

- Open /docs at 1920x1080 and inspect the two links to /docs.
- Open /docs/learn/create-an-app and inspect the missing common sections and text-only header.

## Evidence

- before: [screenshot](evidence/001/before-home.png) — 
- before: [screenshot](evidence/001/before-create.png) — 
- before: [dom](evidence/001/before-home.json) — 
- before: [test](evidence/001/browser-before.txt) — New navigation test fails against the original production build.
- after: [screenshot](evidence/001/after-home.png) — 
- after: [screenshot](evidence/001/after-create.png) — 
- after: [screenshot](evidence/001/after-mobile.png) — 
- after: [dom](evidence/001/browser-assertions.json) — 
- after: [dom](evidence/001/home-assertions.json) — 
- after: [dom](evidence/001/mobile-assertions.json) — 
- after: [test](evidence/001/browser-after.txt) — 23 cases passed on port 3001; the remaining test hard-codes port 3002.
- after: [test](evidence/001/browser-landing-after.txt) — The remaining landing navigation case passes on its required port 3002.

## Environment

```json
{
  "url": "http://127.0.0.1:3001/docs/learn/create-an-app",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "role": "anonymous",
  "framework": "Blume 2.2.5 / Astro 7.4.2",
  "package": "@relkit/docs"
}
```

## Verification

```json
{
  "browser": {
    "status": "passed",
    "assertion": "The overview appears once and is marked current. Common links and nested sections remain available on all five tested routes; current-page highlighting and the landing logo render. The mobile menu supports keyboard expansion and sublink navigation without horizontal overflow. All 24 browser cases passed across the preview run and the targeted standard-port rerun.",
    "steps": [
      "Open /docs and /docs/learn/create-an-app at 1920x1080 and assert unique destinations, current page and logo.",
      "Open the tutorial at 390x844, show the mobile drawer and assert no duplicate links or overflow.",
      "Run all 24 existing and new browser cases against the current production build on port 3001.",
      "Rerun the single landing navigation case on its hard-coded port 3002."
    ]
  },
  "checks": [
    {
      "name": "docs tests",
      "command": "bun run test",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/tests-after.txt"
    },
    {
      "name": "typecheck, JSDoc, links and search",
      "command": "bun run typecheck && bun run check:jsdoc && bun run check:links && bun run check:search",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/check-after.txt"
    },
    {
      "name": "isolated production build",
      "command": "bun run build --isolated",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/build.txt"
    },
    {
      "name": "shared production build",
      "command": "bunx --no-install blume build --strict",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/production-build-shared.txt"
    },
    {
      "name": "landing navigation on standard test port",
      "command": "bun run test:browser browser/landing.spec.ts --grep 'navigation between docs'",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/browser-landing-after.txt"
    }
  ],
  "regressions": [
    {
      "assertion": "Mobile sidebar fits the 390px viewport.",
      "status": "passed",
      "output": "evidence/001/after-mobile.png"
    }
  ],
  "limitations": [
    "No full monorepo acceptance or deployment was run.",
    "No React implementation or Effect runtime changed; the change uses Blume configuration and pure catalog transformation."
  ]
}
```

## Related reports

```json
[]
```

## Notes

```json
[
  "The new catalog coverage test checks every docs and guides page exactly once; all 125 docs tests passed.",
  "The initial full check passed generation freshness, then rejected toSorted in the new test under ES2022. Replaced it with sort and reran all remaining checks successfully.",
  "The first normal production build overlapped another chat's build in the same output directory and failed on a missing generated chunk. The subsequent shared production build completed with exit code 0, verified from that command's result, and its output was used for all final browser checks.",
  "The port-3001 browser run reported 23 passed and one hard-coded port mismatch. No product change was needed; that case passed on its configured port 3002.",
  "The production preview remains available on port 3001. Temporary port-3003 previews, isolated build artifacts and the generated temporary ignore file were cleaned up.",
  "Five authored files changed for this task. Existing work was preserved; nothing was staged, committed, pushed or deployed. Approximate elapsed time: 22 minutes."
]
```
