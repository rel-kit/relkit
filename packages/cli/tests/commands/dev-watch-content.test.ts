/**
 * The watcher's baseline of file content is bounded: a root that holds far more than source must
 * not delay the server's start, and what lies beyond the bounds counts as changed when first seen.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createWatchContentLedger } from "../../src/commands/dev-watch-content.js";

let root: string | undefined;
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

/** Writes `count` files named `file-<n>.ts`, each holding `bytes` characters. */
function project(count: number, bytes = 8): string {
  root = mkdtempSync(join(tmpdir(), "relkit-watch-content-"));
  mkdirSync(join(root, "node_modules/dependency"), { recursive: true });
  writeFileSync(join(root, "node_modules/dependency/index.js"), "x");
  for (let index = 0; index < count; index += 1)
    writeFileSync(join(root, `file-${String(index).padStart(2, "0")}.ts`), "x".repeat(bytes));
  return root;
}

test("a recorded file is unchanged until its content differs", () => {
  const ledger = createWatchContentLedger(project(3));
  ledger.record(root!);
  expect(ledger.changed(["file-00.ts", "file-01.ts"])).toEqual([]);
  writeFileSync(join(root!, "file-01.ts"), "edited");
  expect(ledger.changed(["file-00.ts", "file-01.ts"])).toEqual(["file-01.ts"]);
  expect(ledger.changed(["file-01.ts"])).toEqual([]);
});

test("the recording stops at its entry bound and the rest counts as changed once", () => {
  const ledger = createWatchContentLedger(project(30), { entries: 10, bytes: 1_000_000 });
  ledger.record(root!);
  expect(ledger.changed(["file-00.ts", "file-09.ts"])).toEqual([]);
  expect(ledger.changed(["file-10.ts", "file-29.ts"])).toEqual(["file-10.ts", "file-29.ts"]);
  expect(ledger.changed(["file-10.ts", "file-29.ts"])).toEqual([]);
});

test("the recording stops at its byte bound", () => {
  const ledger = createWatchContentLedger(project(30, 100), { entries: 1_000, bytes: 450 });
  ledger.record(root!);
  expect(ledger.changed(["file-04.ts"])).toEqual([]);
  expect(ledger.changed(["file-05.ts"])).toEqual(["file-05.ts"]);
});

test("dependencies are never read", () => {
  const ledger = createWatchContentLedger(project(1), { entries: 2, bytes: 1_000 });
  ledger.record(root!);
  expect(ledger.changed(["file-00.ts"])).toEqual([]);
});
