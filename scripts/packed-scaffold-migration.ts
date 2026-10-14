/** Exercises the installed migration CLI against a real flat application and protected persistent bytes before returning to grouped layout. */
import { strict as assert } from "node:assert";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { scaffoldNative } from "./scaffold-native.js";
import { PackedMigration } from "./packed-scaffold.schemas.js";
import { projectSnapshot } from "./scaffold-project-files.js";
import type { PackedCommand, PackedScaffoldFixture } from "./packed-scaffold.types.js";

/**
 * Creates a known flat compatibility fixture from the generated grouped Hello starter.
 * @param root - Test-owned installed application, with no active development child.
 * @returns Completion after moving the entire service and its two authored alias references.
 */
const makeFlatFixture = Effect.fn("PackedScaffold.flatFixture")(function* (root: string) {
  yield* scaffoldNative("fixture.flat.move", () =>
    rename(join(root, "src/services/hello"), join(root, "src/hello")),
  );
  for (const path of [
    "src/hello/service.ts",
    "src/routes/hello/route.ts",
    "tests/unit/hello.function.test.ts",
  ]) {
    const file = join(root, path);
    const text = yield* scaffoldNative("fixture.flat.read", () => readFile(file, "utf8"));
    assert.ok(text.includes("@app/services/hello/"));
    yield* scaffoldNative("fixture.flat.reference", () =>
      writeFile(file, text.replaceAll("@app/services/hello/", "@app/hello/")),
    );
  }
  const state = join(root, ".relkit/state");
  yield* scaffoldNative("fixture.state.directory", () => mkdir(state, { recursive: true }));
  yield* scaffoldNative("fixture.state.bytes", () =>
    writeFile(join(state, "layout-sentinel"), "accepted-work-must-survive\n", { mode: 0o600 }),
  );
});

/**
 * Proves preview immutability, publication validation, guarded rollback and grouped no-op through the packed command.
 * @param run - Captured child command authority.
 * @param fixture - Exact installed registry and executable identity.
 * @param root - Owned generated application.
 * @returns Completion with grouped sources restored and persistent bytes unchanged.
 */
export const verifyPackedMigration = Effect.fn("PackedScaffold.migration")(function* (
  run: PackedCommand,
  fixture: PackedScaffoldFixture,
  root: string,
) {
  yield* makeFlatFixture(root);
  const before = yield* projectSnapshot(root);
  const invoke = (args: readonly string[]) =>
    run({
      args: [fixture.relkitBin, "--json", "migrate", "layout", ...args, "--project-root", root],
      cwd: root,
    }).pipe(
      Effect.map((text) => Schema.decodeUnknownSync(Schema.fromJsonString(PackedMigration))(text)),
    );
  const preview = yield* invoke([]);
  assert.equal(preview.status, "preview");
  assert.deepEqual(yield* projectSnapshot(root), before);
  const committed = yield* invoke(["--write"]);
  assert.equal(committed.ok, true);
  assert.equal(committed.status, "committed");
  assert.equal(committed.verification, "passed");
  assert.ok(committed.receipt);
  assert.equal((yield* invoke(["--rollback", committed.receipt])).status, "rolled-back");
  const restored = yield* projectSnapshot(root);
  // Recovery receipts are intentionally retained; every original project byte/mode must match.
  for (const [path, bytes] of Object.entries(before)) assert.deepEqual(restored[path], bytes, path);
  assert.equal((yield* invoke(["--write"])).status, "committed");
  assert.equal((yield* invoke(["--write"])).status, "noop");
  assert.equal(
    yield* scaffoldNative("fixture.state.verify", () =>
      readFile(join(root, ".relkit/state/layout-sentinel"), "utf8"),
    ),
    "accepted-work-must-survive\n",
  );
  for (const script of ["check", "typecheck", "test", "build"])
    yield* run({ args: ["run", script], cwd: root });
});
