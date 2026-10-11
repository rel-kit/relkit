# Packed baseline

Measured the unchanged default `minimal / jobs:none / cloud:none / deploy:none / examples:on` project on Apple M1 Pro, macOS 15.7.1 (24G309), arm64, Bun 1.3.10, TypeScript 5.9.3. Installed packages are the candidate 0.7.2 tarballs, outside the contributor workspace. Raw attempts and executable/lock/tarball identities are in `baseline.json`.

`bun run scripts/benchmark-packed-dev.ts` produced five sequential starts. The timer reads Effect's monotonic nanoseconds before spawning literal `bun dev`, and stops after status 200 and the complete exact `{"message":"Hello, RelKit!"}` body from public `/hello?name=RelKit`. Cleanup is outside the sample duration and joined before the next launch. No warmup was discarded. No Docker service was required. Backend port was 55122; the existing CLI selected inspector port 55123. Contributor inspector override was absent.

| Run | Command-to-response ms | Logged second compile ms |
| --- | ---: | ---: |
| 1 | 6021.755917 | 2685 |
| 2 | 6182.970500 | 2746 |
| 3 | 5814.214500 | 2712 |
| 4 | 5859.887958 | 2756 |
| 5 | 5811.708667 | 2661 |

Median: **5859.887958 ms**. Nearest-rank p95 and maximum: **6182.970500 ms**. Every launch returned the correct route body. This baseline does not pass the 500 ms gate. The historical approximately seven-second observation remains an earlier observation, not the result of this run.

The terminal's second `Compiled in` interval accounts for 2.66–2.76 seconds. Approximately another three seconds elapses before its `Starting development server` / compile phase, and about 50 ms follows Ready before the external response completes. These are coarse terminal-stage observations; they do not isolate initial checking, module loading or support acquisition. They must not be presented as independently profiled component costs.

Initial packing exposed contributor lockfile workspace metadata resolving 0.7.0 against 0.7.2 manifests. Frozen installation and lockfile-only refresh did not change that metadata. The harness now uses the existing isolated release packing stage, which validates concrete tarball dependencies at 0.7.2; no dependency mismatch is bypassed and the contributor lockfile was not modified.

## Diagnostic prepared-bundle experiment

After baseline capture, production build of this retained fixture succeeded. Five direct launches of `bun .relkit/build/server/index.js` reached the same correct route in 328.280000, 335.788458, 369.127042, 376.337792 and 396.598208 ms. Each child was stopped and joined. This experiment excludes generated `bun dev`, input/dependency validation and supervisor activation; it is **not acceptance evidence**. It shows the current bundle's startup leaves little margin and supports implementing reduced runtime loading and independent support acquisition.

## Limits

The host load sampled after the set was approximately 5.09 / 5.56 / 4.43. Power state and background host work were not controlled for this diagnostic baseline. Final certification requires the specified controlled 20 first-start and 20 restart sets per supported tuple, prerequisite checks, generation/cohort proof, and stronger process-tree fault coverage. No combination is certified by this five-run report.
