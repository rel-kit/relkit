/**
 * A file saved while the type checker's first pass runs is found, so that the checker can be
 * started again instead of leaving that file unchecked.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { sourceSavedSince } from "../../src/dev-reload/typecheck-stale.js";

let root: string | undefined;
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

/** Writes a file whose modification time is `at`. */
function file(path: string, at: Date): void {
  mkdirSync(join(root!, path, ".."), { recursive: true });
  writeFileSync(join(root!, path), "export {};\n");
  utimesSync(join(root!, path), at, at);
}

test("finds a source file saved after the checker started", () => {
  root = mkdtempSync(join(tmpdir(), "relkit-typecheck-stale-"));
  const started = Date.now();
  file("src/a.ts", new Date(started - 60_000));
  file("src/deep/b.ts", new Date(started - 60_000));
  expect(sourceSavedSince(root, started)).toBe(false);
  file("src/deep/b.ts", new Date(started + 1_000));
  expect(sourceSavedSince(root, started)).toBe(true);
});

test("ignores dependencies, outputs and files outside src", () => {
  root = mkdtempSync(join(tmpdir(), "relkit-typecheck-stale-"));
  const started = Date.now();
  file("src/a.ts", new Date(started - 60_000));
  file("src/node_modules/x/index.js", new Date(started + 1_000));
  file("src/.relkit/generated/y.ts", new Date(started + 1_000));
  file("notes.md", new Date(started + 1_000));
  expect(sourceSavedSince(root, started)).toBe(false);
});

test("a project without src is scanned from its root", () => {
  root = mkdtempSync(join(tmpdir(), "relkit-typecheck-stale-"));
  const started = Date.now();
  file("services/a.ts", new Date(started - 60_000));
  file("node_modules/x/index.js", new Date(started + 1_000));
  expect(sourceSavedSince(root, started)).toBe(false);
  file("services/a.ts", new Date(started + 1_000));
  expect(sourceSavedSince(root, started)).toBe(true);
});
