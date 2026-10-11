# Packaged capability evidence

## Published table

`packages/create-relkit/src/create-capabilities.ts` is the shared, versioned
source of truth for interactive and headless creation. Version 1 publishes one
tuple:

| Field | Certified value |
| --- | --- |
| template | `minimal` |
| jobs | `none` |
| cloud | `none` |
| deploy | `none` |
| examples | `on` |
| RELKIT release | `0.7.2` |
| Bun | `1.3.10` |
| TypeScript | `5.9.3` |
| snapshot protocol | `1` |
| template identity | `default/v1/minimal` |
| template digest | `b6f8bab8acf86d4cd557a37df262eb23fda316de22517ec003b38415164df620` |
| timing reports | `certification-default-fresh.json`, `certification-default-restarts.json` |

The table deliberately stores stable report identities rather than report
digests: each report includes the packed `create-relkit` artifact hash, so putting
the report hash into that artifact would create a self-referential digest cycle.
Report digests are recorded in `implementation-status.md` for audit comparison.

## Inventory and gating

The parser accepts 128 normalized candidate combinations across template, jobs,
cloud, deploy and examples. The capability table certifies one. The remaining
127 are candidate-only and are rejected before destination staging, package
installation, or other creation side effects. They are not treated as equivalent
to the default tuple.

Interactive prompts derive their choices from the same table and therefore show
only `minimal`, jobs `none`, cloud `none`, deploy `none`, and examples enabled.
Headless requests are normalized and then checked against the identical table.
An explicit unsupported request reports the normalized tuple and the supported
choice. A stale release, Bun, TypeScript, snapshot protocol, template identity,
template digest or missing evidence filename makes an entry unavailable.

Native jobs remain unavailable. Docker, AWS/Pulumi, no-examples, API, agent,
fullstack and tasks candidates have no published capability entry and make no
sub-500 ms claim.

## Equivalence evidence

- The option-matrix cohort enumerates the complete candidate vocabulary and its
  normalized destinations and output contracts.
- Publication and sealed-artifact tests cover directory relocation and ensure no
  physical staging root becomes part of the activatable snapshot.
- Packed acceptance creates outside the workspace through the private registry,
  preserves the prepared pointer across atomic publication, performs a frozen
  reinstall, and exercises JSON output and the generated command workflow.
- `--no-install` acceptance executes the printed finite sequence with local
  package resolution, proves preparation opens no server, and obtains the same
  public response on launch.
- Git initialization is presentation-only for runtime capability; resolver and
  generation tests cover enabled and disabled output without changing the
  prepared runtime inputs.

## Publication rule

A tuple may be added only when its current identity has passing packed workflow,
fault-matrix, fresh-install and unchanged-restart evidence. Missing, stale, or
failing evidence hides the tuple interactively and rejects it headlessly. The
default tuple is not allowed to fall back to an uncertified entry.
