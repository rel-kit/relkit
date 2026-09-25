import { readFileSync } from "node:fs";
import { expect } from "vitest";

/** Read a JSON golden file from the config package test directory. */
export function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), "utf8"));
}

/** Assert that a secret does not appear in a nested public value. */
export function assertSecretAbsent(
  value: unknown,
  forbidden: string,
  seen = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    expect(value).not.toContain(forbidden);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSecretAbsent(item, forbidden, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    expect(key).not.toContain(forbidden);
    assertSecretAbsent(item, forbidden, seen);
  }
}
