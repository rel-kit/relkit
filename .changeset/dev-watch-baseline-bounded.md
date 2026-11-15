---
"@relkit/cli": patch
---

`relkit dev` bounds the baseline it reads to tell a real edit from an event without a change: at most 20,000 entries and 256 MiB per watched directory, so a project root that holds far more than source no longer delays the start. A file outside the baseline, or created later, counts as changed the first time it is seen and is compared from then on.
