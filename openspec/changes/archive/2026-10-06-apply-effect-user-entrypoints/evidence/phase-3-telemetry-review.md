# Independent telemetry review

Reviewer: `/root/plan_create_relkit`. Author: `/root`.
Scope: 17 `dev-telemetry*.ts` source leaves and two package-root Effect test
files. All 19 were read through EOF; the complete classifications and final
SHA-256 values are in `phase-3-telemetry-review-files.json`. The largest source
file has 219 lines. No source was edited by this reviewer.

## Accepted ownership and behavior

The selected native service supplies worker, stream and listener authority.
Acquisition registers each release in one sequential child Scope before
cancellation can enter the next stage. Failed open/listener acquisition closes
prior owners. The first concurrent close owns shutdown, and later closes join
the same Deferred receipt. Live consumers close before queue, router, listener
and worker retirement; worker close acknowledgement and native PID exit are
separate physical receipts.

Private per-session Refs are allocated before worker callbacks can publish
failure. Failure is retained before best-effort notification; throwing
notification cannot replace storage outcomes. Configuration admission, opaque
IPC records, pages and recursive details use owner validation and Schema
boundaries. Query shapes match the observability owner's public contracts;
record validation retains native record fields. Existing best-effort retention
reconfiguration and degraded status behavior remain intact.

Native queue/query/HTTP callbacks reuse the captured execution context and
shared runners. HTTP disconnection cannot abort the session-owned worker, while
the Inspector SDK separately owns each SSE consumer through its request signal.
Public close remains a memoized Promise edge. Cleanup issues are bounded in the
shared ledger and retained beside object/error owners without changing public
JSON shapes. Library logging remains quiet; domain operations use bounded
shared execution labels. Allocating local state, Schema validation helpers and
pure stream/error projections belong to their observed acquisition or method.
No cache or resource map is warranted for this one finite session owner.

## Reference and compatibility checks

The `use-effect` skill and its lifecycle/contracts/API/TSDoc guidance were
applied alongside the project Effect skill. The read-only vendor checkout lacks
core Scope, Effect and Stream implementation/test leaves. Installed Effect
4.0.1 Scope documentation/examples and `internal/effect.ts` were checked:
forking registers the child with its parent, manual child close detaches it,
sequential close settles finalizers in reverse registration order, and close
owns interruption masking. Existing verification evidence for Context.Service,
Layer, Ref, Schema and shared execution runners is reused.

The local worker SDK source confirms synchronous spawn followed by cancellable
IPC, explicit close ownership and finite IPC deadlines. The Inspector source
confirms router retirement and separately scoped SSE consumer ownership. The
CodeGraph exploration was attempted first; its CLI reported no available index,
so normal source tools were used without creating an index.

## Independent gates

- `rtk bun x --bun vitest run packages/cli/tests/telemetry --maxWorkers=1`:
  **6/6 passed**, two files, 12.50 seconds.
- Strict actual compilation of both test bodies, including their source
  dependency closure, with strict/noUncheckedIndexedAccess/
  exactOptionalPropertyTypes/`skipLibCheck:false`: **zero diagnostics**.
  The executed positive/negative consumer probes retain Native, Cleanup and
  Scope authority and detect deliberate environment erasure.
- Native persistence/error pair initially produced **3 passes, one failure**:
  one reload returned false while the CLI graph was changing. Lock diagnostics
  and remote redaction passed. The affected persistence test reran in isolation
  and **passed 1/1 in 13.50 seconds**, including real DuckDB persistence,
  generation reload, SSE shutdown, one JSON failure result and native retirement.
- Final 19-file SHA verification: **19/19 unchanged** from the EOF review freeze.

No remaining telemetry source finding was identified. This slice does not
substitute for the coordinator's full package/demo/packing gates.
