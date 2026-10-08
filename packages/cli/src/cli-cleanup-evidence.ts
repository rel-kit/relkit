import { Ref } from "effect";
import { cliOriginalError } from "./cli-errors.js";
import type { CleanupCapabilities, CleanupIssue } from "./services/cleanup.types.js";

const receipts = new WeakMap<object, readonly CleanupIssue[]>();
const ledgers = new WeakMap<CleanupCapabilities, Ref.Ref<readonly CleanupIssue[]>>();

/**
 * Reads retained secondary release evidence without changing public identity or JSON.
 * @param value - Original public result or failure.
 * @returns An immutable bounded receipt, empty when cleanup succeeded.
 */
export function cliCleanupFailures(value: unknown): readonly CleanupIssue[] {
  const owner = cliOriginalError(value);
  return typeof owner === "object" && owner !== null ? (receipts.get(owner) ?? []) : [];
}

/**
 * Retains an immutable release snapshot alongside its original public owner.
 * @param value - Public result or failure, including an original abort reason.
 * @param evidence - Release ledger captured after physical cleanup has settled.
 * @returns No value; primitive results cannot retain object-owned diagnostics.
 */
export function retainCliCleanupFailures(value: unknown, evidence: readonly CleanupIssue[]): void {
  const owner = cliOriginalError(value);
  if (typeof owner !== "object" || owner === null || !evidence.length) return;
  const all = [...cliCleanupFailures(owner), ...evidence];
  const first = all[0];
  receipts.set(
    owner,
    Object.freeze(
      (all.length <= 128 || !first ? all : [first, ...all.slice(-127)]).map((entry) =>
        Object.freeze({ ...entry }),
      ),
    ),
  );
}

/**
 * Registers a native edge inspection bridge without extending the ledger's lifetime.
 * @param service - Invocation-owned cleanup authority.
 * @param state - Bounded Ref owned by that service.
 * @returns No value; domain workflows continue to use observed snapshot().
 */
export function registerCliCleanupLedger(
  service: CleanupCapabilities,
  state: Ref.Ref<readonly CleanupIssue[]>,
): void {
  ledgers.set(service, state);
}

/**
 * Captures final release evidence after the owning runtime has disposed.
 * @param service - Previously acquired invocation cleanup authority.
 * @returns An immutable snapshot; no Effect executes in the disposed runtime.
 * @remarks This synchronous bridge exists only for manual/public execution edges.
 */
export function cliCleanupSnapshotUnsafe(service: CleanupCapabilities): readonly CleanupIssue[] {
  const state = ledgers.get(service);
  return state ? Object.freeze([...Ref.getUnsafe(state)]) : [];
}
