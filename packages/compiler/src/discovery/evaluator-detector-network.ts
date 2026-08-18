import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import type { EvaluatorSideEffectKind } from "./evaluator-protocol.js";

type MutableRecord = Record<string, unknown>;
type GenericFunction = (...args: unknown[]) => unknown;
type Restore = () => void;
type Violate = (kind: EvaluatorSideEffectKind, operation: string, target: string) => never;

export function installNetworkDetectors(
  allowlist: readonly string[],
  restores: Restore[],
  violate: Violate,
): void {
  const bun = Bun as unknown as MutableRecord;
  for (const name of ["listen", "serve"])
    patchReject(bun, name, "listening-socket", restores, violate);
  for (const name of ["spawn", "spawnSync", "$"])
    patchReject(bun, name, "child-process", restores, violate);
  patchChecked(bun, "connect", "unapproved-network", allowlist, restores, violate);
  patchGlobalNetwork(allowlist, restores, violate);
  for (const name of ["spawn", "spawnSync", "exec", "execFile", "fork"])
    patchReject(childProcess as unknown as MutableRecord, name, "child-process", restores, violate);
  for (const name of ["request", "get"])
    patchChecked(
      http as unknown as MutableRecord,
      name,
      "unapproved-network",
      allowlist,
      restores,
      violate,
    );
  for (const name of ["request", "get"])
    patchChecked(
      https as unknown as MutableRecord,
      name,
      "unapproved-network",
      allowlist,
      restores,
      violate,
    );
  patchChecked(
    tls as unknown as MutableRecord,
    "connect",
    "unapproved-network",
    allowlist,
    restores,
    violate,
  );
  patchReject(
    net.Server.prototype as unknown as MutableRecord,
    "listen",
    "listening-socket",
    restores,
    violate,
  );
  patchChecked(
    net as unknown as MutableRecord,
    "connect",
    "unapproved-network",
    allowlist,
    restores,
    violate,
  );
  patchChecked(
    net as unknown as MutableRecord,
    "createConnection",
    "unapproved-network",
    allowlist,
    restores,
    violate,
  );
  patchReject(
    dgram.Socket.prototype as unknown as MutableRecord,
    "bind",
    "listening-socket",
    restores,
    violate,
  );
  patchChecked(
    dgram.Socket.prototype as unknown as MutableRecord,
    "connect",
    "unapproved-network",
    allowlist,
    restores,
    violate,
  );
  for (const name of ["lookup", "resolve", "reverse"])
    patchChecked(
      dns as unknown as MutableRecord,
      name,
      "unapproved-network",
      allowlist,
      restores,
      violate,
    );
}

function patchGlobalNetwork(
  allowlist: readonly string[],
  restores: Restore[],
  violate: Violate,
): void {
  const globalRecord = globalThis as unknown as MutableRecord;
  patchChecked(globalRecord, "fetch", "unapproved-network", allowlist, restores, violate);
  for (const name of ["WebSocket", "EventSource", "XMLHttpRequest"])
    patchChecked(globalRecord, name, "unapproved-network", allowlist, restores, violate);
}

function patchReject(
  target: MutableRecord,
  name: string,
  kind: EvaluatorSideEffectKind,
  restores: Restore[],
  violate: Violate,
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  target[name] = function (...args: unknown[]) {
    violate(kind, name, targetFor(kind, args));
  };
  restores.push(() => {
    target[name] = original;
  });
}

function patchChecked(
  target: MutableRecord,
  name: string,
  kind: EvaluatorSideEffectKind,
  allowlist: readonly string[],
  restores: Restore[],
  violate: Violate,
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const method = original as GenericFunction;
  target[name] = function (this: unknown, ...args: unknown[]) {
    const targetValue = targetFor(kind, args);
    if (!isAllowed(targetValue, allowlist)) {
      violate(kind, name, targetValue);
    }
    return method.apply(this, args);
  };
  restores.push(() => {
    target[name] = original;
  });
}

function targetFor(kind: EvaluatorSideEffectKind, args: readonly unknown[]): string {
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

function commandTarget(args: readonly unknown[]): string {
  const first = args[0];
  if (Array.isArray(first)) return first.map(String).join(" ");
  if (typeof first === "string") return first;
  return "child-process";
}

function isAllowed(target: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0 || target === "unknown") return false;
  if (allowlist.includes(target)) return true;
  try {
    return allowlist.includes(new URL(target).hostname);
  } catch {
    return allowlist.includes(target.split(":", 1)[0] ?? target);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
