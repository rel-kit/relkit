import { createHash } from "node:crypto";

export function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

export function date(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function hashSigningKey(signingKey: string): string {
  const prefix = signingKey.match(/^signkey-[\w]+-/u)?.[0] ?? "";
  const key = signingKey.slice(prefix.length).replace(/[^a-z0-9]/giu, "");
  const normalized = key.length % 2 === 0 ? key : `0${key}`;
  return `${prefix}${createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex")}`;
}
