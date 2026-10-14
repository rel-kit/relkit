/** Seeds one stale content-addressed cohort for the real prepared-command refusal test. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect, Schema } from "effect";
import { APPLICATION_LAYOUT_VERSION, canonicalJson } from "@relkit/contracts";
import manifest from "../../package.json" with { type: "json" };
import effectManifest from "effect/package.json" with { type: "json" };
import typescriptManifest from "typescript/package.json" with { type: "json" };
import { SnapshotTools } from "../../src/dev-snapshot/snapshot.schemas.js";
import {
  snapshotDigest,
  snapshotFingerprint,
} from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { validationFixture } from "./validation-fixture.js";

const execute = promisify(execFile);

/**
 * Writes a complete fake capsule whose source bytes intentionally differ from the receipt.
 * @param root - Exclusively owned temporary root.
 * @returns Native fixture setup completion without executing application code.
 */
export const seedStaleCommandFixture = Effect.fn("SnapshotTest.seedStale")(function* (
  root: string,
) {
  const fixture = validationFixture(root);
  const version = yield* Effect.tryPromise({
    try: (signal) => execute("bun", ["--version"], { signal, timeout: 5000 }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error("Bun version probe failed", { cause }),
  });
  const tools = yield* Schema.decodeUnknownEffect(SnapshotTools)({
    layout: APPLICATION_LAYOUT_VERSION,
    bun: version.stdout.trim(),
    effect: effectManifest.version,
    typescript: typescriptManifest.version,
    relkit: manifest.version,
    platform: `${process.platform}-${process.arch}`,
  });
  const receipt = {
    ...fixture.receipt,
    tools,
    ports: { backend: 3000, inspector: 3210 },
    fingerprint: snapshotFingerprint({ ...fixture.receipt, tools }),
  };
  const encoded = canonicalJson(receipt),
    generation = snapshotDigest(encoded);
  const capsule = join(root, ".relkit/dev/generations", generation.slice(7));
  yield* Effect.forEach(
    [...fixture.bytes],
    ([path, text]) =>
      Effect.tryPromise(async () => {
        if (!path.startsWith(fixture.capsuleRoot + "/") || path.endsWith("/receipt.json")) return;
        const destination = join(capsule, path.slice(fixture.capsuleRoot.length + 1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, text);
      }),
    { concurrency: 4, discard: true },
  );
  yield* Effect.tryPromise(async () => {
    await writeFile(join(capsule, "receipt.json"), encoded);
    await writeFile(
      join(root, ".relkit/dev/current.json"),
      canonicalJson({ version: 1, generation }),
    );
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "changed source");
  });
});
