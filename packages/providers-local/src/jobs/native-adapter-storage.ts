import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { NativeControlReceipt, NativeSubmission } from "@relkit/jobs/adapter";
import { createJobStore, type JobRecord, type JobStore } from "./store.js";
import type {
  LocalNativeRun,
  LocalNativeState,
  LocalNativeNamespace,
} from "./native-adapter-types.js";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";

const NATIVE_STATE_VERSION = 1 as const;

/** Recovers durable native run and control records into the in-memory service indexes.
 * @param root - Owned state directory.
 * @param state - Current service-owned state.
 * @returns The recovered native journal owner.
 */
export async function openNativeStore(root: string, state: LocalNativeState): Promise<JobStore> {
  const store = await createJobStore(root, { validateData: validateNativeData });
  for (const record of store.snapshot().records) applyRecord(state, record);
  state.store = store;
  return store;
}

/** Appends the canonical native run state before acknowledging its transition.
 * @param store - Owning persisted-state or journal operations.
 * @param run - Current persisted native or agent run.
 * @returns A Promise completing after the run-state record is durably appended.
 */
export function persistNativeRun(store: JobStore, run: LocalNativeRun): Promise<void> {
  return store
    .append({
      instanceId: run.runId,
      kind: "native-run",
      data: json({
        version: NATIVE_STATE_VERSION,
        kind: "run",
        runId: run.runId,
        request: run.request,
        namespace: run.namespace,
        service: run.service,
        acceptedAt: run.acceptedAt,
        status: run.status,
        attempt: run.attempt,
        ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }),
        ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }),
        ...(run.nextEligibleAt === undefined ? {} : { nextEligibleAt: run.nextEligibleAt }),
        ...(run.output === undefined ? {} : { output: run.output }),
        ...(run.error === undefined ? {} : { error: run.error }),
        ...(run.retryOfRunId === undefined ? {} : { retryOfRunId: run.retryOfRunId }),
        completedSleeps: [...run.completedSleeps],
        canonicalInput: run.canonicalInput,
      }),
    })
    .then(() => undefined);
}

/** Appends a replayable cancellation or retry receipt for idempotent controls.
 * @param store - Owning persisted-state or journal operations.
 * @param kind - Declared record or control kind.
 * @param key - Application or durable-storage key.
 * @param receipt - Stored acceptance or control receipt.
 * @returns A Promise completing after the control receipt is durably appended.
 */
export function persistNativeControl(
  store: JobStore,
  kind: "cancel" | "retry",
  key: string,
  receipt: NativeControlReceipt,
): Promise<void> {
  return store
    .append({
      instanceId: `native-control:${kind}:${key}`,
      kind: `native-${kind}`,
      data: json({ version: NATIVE_STATE_VERSION, kind, key, receipt }),
    })
    .then(() => undefined);
}

/** Replays one validated native record into its owning run or control index.
 * @param state - Current service-owned state.
 * @param record - Durable record or audit entry.
 * @returns Nothing; the validated record updates its run or control index.
 */
function applyRecord(state: LocalNativeState, record: JobRecord): void {
  if (record.kind === "native-run") {
    const run = readRun(record.data);
    state.runs.set(run.runId, run);
    return;
  }
  if (record.kind === "native-cancel" || record.kind === "native-retry") {
    const data = record.data as Record<string, JsonValue>;
    const key = typeof data.key === "string" ? data.key : undefined;
    if (key === undefined) throw new Error("Native control record key is invalid");
    const receipt = data.receipt as unknown as NativeControlReceipt;
    (record.kind === "native-cancel" ? state.cancelControls : state.retryControls).set(
      key,
      receipt,
    );
  }
}

/** Reconstructs a native run while resetting nonserializable attempt resources.
 * @param value - Value to validate, normalize or project.
 * @returns The recovered native run state.
 */
function readRun(value: JsonValue): LocalNativeRun {
  if (!isRecord(value) || value.version !== NATIVE_STATE_VERSION || value.kind !== "run") {
    throw new Error("Native run record is invalid");
  }
  if (
    typeof value.runId !== "string" ||
    typeof value.service !== "string" ||
    typeof value.acceptedAt !== "string" ||
    typeof value.status !== "string" ||
    typeof value.attempt !== "number" ||
    !isRecord(value.request) ||
    !isRecord(value.namespace) ||
    value.canonicalInput === undefined
  )
    throw new Error("Native run record is incomplete");
  return {
    runId: value.runId,
    request: value.request as unknown as NativeSubmission,
    namespace: value.namespace as unknown as LocalNativeNamespace,
    service: value.service,
    acceptedAt: value.acceptedAt,
    status: value.status as LocalNativeRun["status"],
    attempt: value.attempt,
    ...(typeof value.startedAt === "string" ? { startedAt: value.startedAt } : {}),
    ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
    ...(typeof value.nextEligibleAt === "string" ? { nextEligibleAt: value.nextEligibleAt } : {}),
    ...(Object.hasOwn(value, "output") ? { output: value.output } : {}),
    ...(isRecord(value.error)
      ? { error: value.error as unknown as NonNullable<LocalNativeRun["error"]> }
      : {}),
    ...(typeof value.retryOfRunId === "string" ? { retryOfRunId: value.retryOfRunId } : {}),
    completedSleeps: new Set(
      Array.isArray(value.completedSleeps)
        ? value.completedSleeps.filter((entry): entry is string => typeof entry === "string")
        : [],
    ),
    canonicalInput: value.canonicalInput as unknown as JobWireEnvelope,
  };
}

/** Rejects unsupported or malformed native journal payloads during recovery.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
function validateNativeData(value: JsonValue): void {
  if (!isRecord(value) || value.version !== NATIVE_STATE_VERSION) {
    throw new Error("Native state record is invalid");
  }
  if (value.kind === "run") readRun(value);
  else if ((value.kind === "cancel" || value.kind === "retry") && typeof value.key === "string")
    return;
  else throw new Error("Native state record kind is invalid");
}

/** Copies an unknown value through canonical JSON before persistence.
 * @param value - Value to validate, normalize or project.
 * @returns The canonical JSON copy.
 */
function json(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
