# Task 17.15 generated determinism and checksum acceptance

Run date: `2026-08-18T23:01:34+03:00`  
Bun: `1.3.10`  
Platform: `Darwin 24.6.0 arm64`

## Two-root generated output comparison

The same `fixture-commerce` application was compiled twice from distinct
absolute temporary roots. The second run reversed candidate enumeration and
used a different evaluator generation identity. Deployment planning used the
same graph-derived inputs, while Pulumi rendering received distinct project
roots.

| Output                                                  |  Bytes | SHA-256                                                            | Cross-root result |
| ------------------------------------------------------- | -----: | ------------------------------------------------------------------ | ----------------- |
| `application.graph.json`                                | 31,227 | `07d5e6cdcf869d2d8d02f6451dfe60708fd32fa0051d3f97f144072e71029b36` | identical         |
| `runtime.manifest.ts`                                   |  2,499 | `bb14407439cfd0bb07d6f791119439065e7045c423b71f68ceb9d7a667ed84f0` | identical         |
| `openapi.json`                                          |  3,146 | `07d8f24264844f41ef04feeed8e8e6a8e1d0fe238ff2b8371051e91b6fb32e07` | identical         |
| `client.ts`                                             |  5,830 | `f516f8c992581c54e6b524c83125bc22abafd3b5d166acaf73b23bfed6565e7a` | identical         |
| deployment plan                                         | 11,634 | `5c8f7d7b9c5ed56485a550529f69c8815bc491e6e6090b24359738e4c0faa46b` | identical         |
| Pulumi program (`Pulumi.yaml`, `index.ts`, `plan.json`) | 25,317 | `6d3dd1591c4ad17241ca9c7119bea847933a99c7a89f77a16c68767d562e1804` | identical         |

The graph hash was identical in both runs:
`sha256:1440ce48cda2419a4d5fe6f488da0c3009e6445088cf5e7dc519c34913504b11`.
The manifest contract version was `1` in both runs and its embedded graph hash
matched the graph hash. Pulumi output contained neither temporary project root.

## Package and template checksums

All 30 packed package artifacts and all 3 versioned templates were copied and
hashed from two distinct absolute roots. Both root pairs were byte-identical.
The resulting checksums and the release input fingerprint now match the
documented list in [`RELEASE_NOTES.md`](../../../../../RELEASE_NOTES.md).

The first comparison found 10 stale package rows in the documented list:
`@relkit/app`, `@relkit/cli`, `@relkit/cloud-aws`, `create-relkit`, `@relkit/engine`,
`@relkit/events`, `@relkit/inspector-api`, `@relkit/providers-local`,
`@relkit/runtime-hono`, and `@relkit/testing`. The two-root artifact bytes were
already stable; the rows reflected an earlier package contents snapshot. Those
rows were updated to the current deterministic hashes. No package source or
packing algorithm changed.

## Checks

| Command                                                               | Result                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| focused compiler/graph/OpenAPI/client/deploy/Pulumi/integration tests | exit `0`; 19 tests, 264 assertions                                                                                                                                            |
| `bun run build`                                                       | exit `0`; 30 workspace package builds successful                                                                                                                              |
| two-root package/template checksum runner                             | exit `0`; 30 packages and 3 templates, cross-root and documented lists equal                                                                                                  |
| release input fingerprint check                                       | exit `0`; `f4e352d69f2a7b1862318b26d0bdcd993f9b9b075cef2182250bb5a42ac5c78a`                                                                                                  |
| protected v3 document checksums                                       | unchanged; technical spec `d69f37f1ff0d157876d624e73bcf163162a73f531b3144e03ef566c672cbb183`, review gates `9f3d0225794ba7de12a5e7835a2f61ca2bc03ce4add8833cfdf21c2970aba464` |

No 17.16 or later checkbox was implemented.
