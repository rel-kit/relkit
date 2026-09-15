import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { NativeControlReceipt, NativeSubmission } from "@relkit/jobs/adapter";
import { createJobStore, type JobRecord, type JobStore } from "./store.js";
import type { LocalNativeRun, LocalNativeState, LocalNativeNamespace } from "./native-adapter-types.js";
import type { JobWireEnvelope } from "@relkit/contracts/jobs";

const NATIVE_STATE_VERSION = 1 as const;

export async function openNativeStore(
  root: string,
  state: LocalNativeState,
): Promise<JobStore> {
  const store = await createJobStore(root, { validateData: validateNativeData });
  for (const record of store.snapshot().records) applyRecord(state, record);
  state.store = store;
  return store;
}

export function persistNativeRun(store: JobStore, run: LocalNativeRun): Promise<void> {
  return store.append({
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
  }).then(() => undefined);
}

export function persistNativeControl(
  store: JobStore,
  kind: "cancel" | "retry",
  key: string,
  receipt: NativeControlReceipt,
): Promise<void> {
  return store.append({
    instanceId: `native-control:${kind}:${key}`,
    kind: `native-${kind}`,
    data: json({ version: NATIVE_STATE_VERSION, kind, key, receipt }),
  }).then(() => undefined);
}

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
    (record.kind === "native-cancel" ? state.cancelControls : state.retryControls).set(key, receipt);
  }
}

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
  ) throw new Error("Native run record is incomplete");
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

function validateNativeData(value: JsonValue): void {
  if (!isRecord(value) || value.version !== NATIVE_STATE_VERSION) {
    throw new Error("Native state record is invalid");
  }
  if (value.kind === "run") readRun(value);
  else if ((value.kind === "cancel" || value.kind === "retry") && typeof value.key === "string") return;
  else throw new Error("Native state record kind is invalid");
}

function json(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
