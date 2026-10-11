/**
 * Persists and validates one successful development check for finite preparation.
 * Reuse requires exact project membership, byte identities, TypeScript resolution
 * observations, and a self-consistent portable payload before build authority is returned.
 */
import crypto from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import { CliFileSystem } from "../services/filesystem.service.js";
import { mapErrorCause } from "../services/map-error-cause.js";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { snapshotDigest, sameSnapshotMembers } from "./snapshot-fingerprint.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotCheckReceipt as ReceiptSchema } from "./snapshot-check-receipt.schemas.js";
import { verifySnapshotTypecheckInputs } from "./snapshot-typecheck-inputs.js";
import type { SnapshotCheckedCompilation } from "./snapshot-compilation.types.js";
import type { SnapshotMember, SnapshotTools } from "./snapshot.types.js";
import type { SnapshotCheckReceipt } from "./snapshot-check-receipt.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/** Project-relative location of the replaceable successful development-check cache. */
export const SNAPSHOT_CHECK_RECEIPT_PATH = ".relkit/generated/dev-check.json";

/**
 * Writes one root-free successful check cache through an atomic rename.
 * @param root - Current project root used only to locate the cache file.
 * @param checked - Accepted compiler output and TypeScript input evidence.
 * @param inputs - Stable complete project input identities around the check.
 * @param tools - Exact compiler/runtime tool identities used by the check installation.
 * @returns A lazy write; native failures remain visible to the optional-cache caller.
 */
export const writeSnapshotCheckReceipt = Effect.fn("DevSnapshot.writeCheckReceipt")(function* (
  root: string,
  checked: SnapshotCheckedCompilation,
  inputs: readonly SnapshotMember[],
  tools: SnapshotTools,
) {
  if (checked.config === undefined || checked.graphHash === undefined) return;
  const files = yield* CliFileSystem;
  const { projectRoot: _projectRoot, ...config } = checked.config;
  const payload = {
    version: 1 as const,
    graphHash: checked.graphHash,
    tools,
    inputs,
    typecheckInputs: checked.typecheckInputs,
    outputs: checked.outputs,
    config,
  };
  const receipt = { ...payload, fingerprint: snapshotDigest(canonicalJson(payload)) };
  const target = join(root, SNAPSHOT_CHECK_RECEIPT_PATH);
  const stage = `${target}.${crypto.randomUUID()}.tmp`;
  yield* files.mkdir(dirname(target));
  yield* files
    .writeText(stage, `${canonicalJson(receipt)}\n`)
    .pipe(
      Effect.andThen(files.rename(stage, target)),
      Effect.ensuring(files.remove(stage).pipe(Effect.orDie)),
    );
});

/**
 * Loads a successful check only when every current input and resolution witness still matches.
 * @param root - Current project root used to reconstruct root-bearing compiler settings.
 * @param inputs - Fresh project inventory captured before preparation.
 * @param tools - Current installed tool identities required for reuse.
 * @returns A reusable checked compilation, or undefined for any absent/stale cache.
 */
export const readSnapshotCheckReceipt = Effect.fn("DevSnapshot.readCheckReceipt")(function* (
  root: string,
  inputs: readonly SnapshotMember[],
  tools: SnapshotTools,
) {
  const files = yield* SnapshotFiles;
  const loaded = yield* decodeReceipt(files, root).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
  );
  if (loaded === undefined || !sameSnapshotMembers(inputs, loaded.inputs)) return undefined;
  if (canonicalJson(loaded.tools) !== canonicalJson(tools)) return undefined;
  const fingerprint = snapshotDigest(canonicalJson(receiptPayload(loaded)));
  if (fingerprint !== loaded.fingerprint) return undefined;
  const current = yield* verifySnapshotTypecheckInputs(files, root, loaded.typecheckInputs).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  if (!current) return undefined;
  const config = { ...loaded.config, projectRoot: root };
  const native = yield* CliFileSystem;
  const manifestCurrent = yield* native
    .readText(resolve(root, config.generatedDirectory, "runtime.manifest.ts"))
    .pipe(
      Effect.map((source) => source === loaded.outputs.manifest),
      Effect.catch(() => Effect.succeed(false)),
    );
  if (!manifestCurrent) return undefined;
  return {
    ok: true,
    activatable: true,
    projectRoot: root,
    generatedDirectory: resolve(root, config.generatedDirectory),
    graphHash: loaded.graphHash,
    diagnostics: [],
    outputs: loaded.outputs,
    config,
    typecheckInputs: loaded.typecheckInputs,
  } satisfies SnapshotCheckedCompilation;
});

/**
 * Decodes bounded receipt bytes without treating malformed cache state as a defect.
 * @param files - Contained bounded file authority acquired by the caller.
 * @param root - Current project root containing the optional cache member.
 * @returns Decoded receipt evidence or a typed stale/native failure.
 */
function decodeReceipt(files: SnapshotFileOperations, root: string) {
  return files.read(root, SNAPSHOT_CHECK_RECEIPT_PATH, 67_108_864).pipe(
    Effect.flatMap((bytes) =>
      Effect.try({
        try: () => JSON.parse(Buffer.from(bytes).toString("utf8")),
        catch: () => rejected("checkReceipt.json"),
      }),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(ReceiptSchema)),
    mapErrorCause(() => rejected("checkReceipt.decode")),
  );
}

/**
 * Selects the canonical fingerprint payload without its self-identity.
 * @param receipt - Fully decoded cache record.
 * @returns Every persisted field except the digest derived from those fields.
 */
function receiptPayload(receipt: SnapshotCheckReceipt) {
  const { fingerprint: _fingerprint, ...payload } = receipt;
  return payload;
}

/** Returns one safe stale-cache rejection without disclosing persisted content. */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "stale", operation });
}
