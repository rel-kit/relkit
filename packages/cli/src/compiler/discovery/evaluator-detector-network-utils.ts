import type { EvaluatorSideEffectKind } from "./evaluator-protocol.js";

/**
 * Projects native invocation arguments into a diagnostic destination.
 * @param kind - Native capability category being intercepted.
 * @param args - Opaque arguments supplied by candidate code.
 * @returns A display destination, with unknown arguments explicitly unapproved.
 * @remarks This synchronous projection belongs to native callback adapters, not an Effect stage.
 */
export function targetFor(kind: EvaluatorSideEffectKind, args: readonly unknown[]): string {
  if (kind === "child-process") return commandTarget(args);
  if (kind === "listening-socket") return "listener";
  const first = args[0];
  if (first instanceof URL) return first.toString();
  if (typeof first === "string") return first;
  if (isRecord(first)) {
    if (typeof first.url === "string") return first.url;
    if (typeof first.hostname === "string") return `${first.hostname}:${String(first.port ?? "")}`;
    if (typeof first.host === "string") return `${first.host}:${String(first.port ?? "")}`;
  }
  if (typeof first === "number") return `${String(args[1] ?? "localhost")}:${first}`;
  return "unknown";
}

/**
 * Projects a native spawn argument into a diagnostic command.
 * @param args - Opaque platform invocation arguments.
 * @returns A command string or a capability label when it cannot be inferred.
 */
function commandTarget(args: readonly unknown[]): string {
  const first = args[0];
  if (Array.isArray(first)) return first.map(String).join(" ");
  if (typeof first === "string") return first;
  return "child-process";
}

/**
 * Applies the candidate's explicit destination permissions at the synchronous native boundary.
 * @param target - Diagnostic destination projected from the intercepted invocation.
 * @param allowlist - Exact destinations or hostnames approved by the request.
 * @returns Whether the native invocation may proceed; unknown destinations are denied.
 * @remarks Native callbacks cannot yield Effects. Parsing checks avoid hiding conversion defects.
 */
export function isAllowed(target: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0 || target === "unknown") return false;
  if (allowlist.includes(target)) return true;
  return URL.canParse(target)
    ? allowlist.includes(new URL(target).hostname)
    : allowlist.includes(target.split(":", 1)[0] ?? target);
}

/**
 * Recognizes an opaque native options object without validating a domain record.
 * @param value - Native argument to narrow.
 * @returns Whether the value supports property inspection.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
