/** Existing markers are normal reopen paths; ownership and unsafe-marker failures remain authoritative. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit, Logger } from "effect";
import { bindInspectorHistory } from "../src/history-binding.js";

test("reopening an owned history marker emits no false failure and never replaces ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-marker-log-"));
  const errors: string[] = [];
  const logger = Logger.layer([
    Logger.make((event) => {
      if (event.logLevel === "Error") errors.push(String(event.message));
    }),
  ]);
  const project = `sha256:${"a".repeat(64)}`;
  const path = join(root, ".inspection-project.json");
  try {
    await Effect.runPromise(bindInspectorHistory(root, project).pipe(Effect.provide(logger)));
    const before = await readFile(path, "utf8");
    await Effect.runPromise(bindInspectorHistory(root, project).pipe(Effect.provide(logger)));
    expect(errors).toEqual([]);
    const foreign = await Effect.runPromiseExit(
      bindInspectorHistory(root, `sha256:${"b".repeat(64)}`).pipe(Effect.provide(logger)),
    );
    expect(Exit.isFailure(foreign)).toBe(true);
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(root)).toEqual([".inspection-project.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
