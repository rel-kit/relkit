# RelKit 0.7.10 release candidate

Deterministic release output generated from checked-in package and template metadata.

## Review status

Package and template metadata was validated. Archive checks run during publication;
owner sign-off remains required before publication.

## Release inputs

- Input fingerprint: `ef43b7635a897b0622598082478e7721713d16b063066c0740c599dc7aa7421d`
- Packages: 3
- Templates: 5
- Package manager: `bun@1.3.10`

| Package       | Version | Exports                                                            | Dependencies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @relkit/cli   | 0.7.10  | ., ./editor, ./help, ./internal/server-runtime, ./internal/tooling | `@clack/prompts@1.7.0`, `@relkit/agents@workspace:*`, `@relkit/app@workspace:*`, `@relkit/client@workspace:*`, `@relkit/client-generator@workspace:*`, `@relkit/compiler@workspace:*`, `@relkit/config@workspace:*`, `@relkit/contracts@workspace:*`, `@relkit/deploy@workspace:*`, `@relkit/deploy-pulumi@workspace:*`, `@relkit/diagnostics@workspace:*`, `@relkit/engine@workspace:*`, `@relkit/graph@workspace:*`, `@relkit/inspector-api@workspace:*`, `@relkit/invocation@workspace:*`, `@relkit/jobs@workspace:*`, `@relkit/local-service@workspace:*`, `@relkit/observability@workspace:*`, `@relkit/realtime@workspace:*`, `@relkit/runtime-effect@workspace:*`, `@relkit/runtime-hono@workspace:*`, `@relkit/supervisor@workspace:*`, `create-relkit@workspace:*`, `effect@4.0.1`, `hono@4.13.7`, `next@16.3.8`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` |
| create-relkit | 0.7.10  | ., ./catalog-resolution                                            | `@clack/prompts@1.7.0`, `@relkit/compiler@workspace:*`, `@relkit/contracts@workspace:*`, `effect@4.0.1`, `typescript@5.9.3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| relkit        | 0.7.10  | .                                                                  | `@relkit/cli@workspace:*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Packed artifacts

The exact tarball hashes and npm integrity values are recorded in the attached
release manifest and checksum files generated by the publication run.

## Template checksums

| Template  | Files | SHA-256                                                            |
| --------- | ----: | ------------------------------------------------------------------ |
| minimal   |    10 | `a4c28292ebf79eaacdc68a7781eec99e6d6d6c59c2a28e271899a8033c348449` |
| api       |    21 | `d55597ec57998ce497702a52aa87ed77fcecaae8558a3cd557c7369ceefd7341` |
| agent     |    18 | `32f9ce467e5afb272776911fdbc8d05a6b1ba93e3250a7e616197b53f7936670` |
| fullstack |    22 | `cf2eb66d5546a13b27b3079dd7d5b8c6f0cfd400cfc02a7849b4af49966054e5` |
| tasks     |    12 | `8f57cf898c7d0f06edff974eef05eeda7a067a97b967083c94804765e92a5b0d` |

## Verification

- The publishing workflow builds and validates the exact packed archives and checksums.
- The full `bun run release:pack` command additionally runs packed export and scaffold smoke checks locally.
- The default release check enforces a clean worktree.
