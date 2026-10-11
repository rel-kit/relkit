/**
 * Exercises the persisted current-check cache through live bounded filesystem
 * adapters. Exact inputs and TypeScript observations permit reuse; any source
 * change falls back without exposing environment files or physical roots.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import {
  captureSnapshotInputs,
  snapshotDigest,
} from "../../src/dev-snapshot/snapshot-fingerprint.js";
import {
  readSnapshotCheckReceipt,
  SNAPSHOT_CHECK_RECEIPT_PATH,
  writeSnapshotCheckReceipt,
} from "../../src/dev-snapshot/snapshot-check-receipt.js";
import type { SnapshotCheckedCompilation } from "../../src/dev-snapshot/snapshot-compilation.types.js";
import type { SnapshotMember } from "../../src/dev-snapshot/snapshot.types.js";
import { tools } from "./validation-fixture.js";

const live = Layer.merge(fileSystemLayer, snapshotFilesLive);

/** Acquires one native fixture and joins recursive cleanup with the test scope. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-check-receipt-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

it.effect("reuses only exact current inputs without persisting roots or environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* Effect.promise(async () => {
        await mkdir(join(root, "src"));
        await writeFile(join(root, "src/app.ts"), "export const value = 1;\n");
        await writeFile(join(root, ".env"), "SYNTHETIC_SECRET=receipt-secret\n");
      });
      const inputs = yield* captureSnapshotInputs(root);
      const checked = fixtureChecked(root, inputs);
      yield* Effect.promise(async () => {
        await mkdir(join(root, ".relkit/generated"), { recursive: true });
        await writeFile(
          join(root, ".relkit/generated/runtime.manifest.ts"),
          checked.outputs.manifest,
        );
      });
      yield* writeSnapshotCheckReceipt(root, checked, inputs, tools);

      expect(yield* readSnapshotCheckReceipt(root, inputs, tools)).toMatchObject({
        graphHash: checked.graphHash,
        outputs: checked.outputs,
      });
      const bytes = yield* Effect.promise(() =>
        readFile(join(root, SNAPSHOT_CHECK_RECEIPT_PATH), "utf8"),
      );
      expect(bytes).not.toContain(root);
      expect(bytes).not.toContain("receipt-secret");
      expect(
        yield* readSnapshotCheckReceipt(root, inputs, { ...tools, relkit: "different" }),
      ).toBeUndefined();

      yield* Effect.promise(() => writeFile(join(root, "src/app.ts"), "export const value = 2;\n"));
      const changed = yield* captureSnapshotInputs(root);
      expect(yield* readSnapshotCheckReceipt(root, changed, tools)).toBeUndefined();
    }),
  ).pipe(Effect.provide(live)),
);

/**
 * Builds one internally consistent successful check without executing source.
 * @param root - Fixture root that must never enter the persisted cache.
 * @param inputs - Complete fixture member identities certified by the check.
 * @returns A successful compilation carrying normalized TypeScript evidence.
 */
function fixtureChecked(
  root: string,
  inputs: readonly SnapshotMember[],
): SnapshotCheckedCompilation {
  const graphHash = snapshotDigest("graph");
  return {
    ok: true,
    activatable: true,
    projectRoot: root,
    generatedDirectory: join(root, ".relkit/generated"),
    graphHash,
    diagnostics: [],
    outputs: {
      graph: "{}\n",
      manifest: "export const runtimeManifest = {};\n",
      runtimeActivation: "{}\n",
      runtimeIntegrations: "{}\n",
      runtimeIntegrationImports: "",
      localServices: "{}\n",
      diagnostics: "[]\n",
      openapi: "{}\n",
      client: "",
      contract: "",
      clientContract: "{}\n",
      clientRegistry: "",
      clientManifest: "{}\n",
    },
    config: { ...DEFAULT_TOOLING_CONFIG, projectRoot: root },
    typecheckInputs: { files: inputs, observations: [] },
  };
}
