/**
 * Defines the portable dev receipt before any persisted path reaches file I/O.
 * Preparation and startup share bounded path, hash, cohort and readiness codecs.
 * Executable bytes and graph semantics are verified by the snapshot service after
 * decoding; decoding alone never grants execution authority.
 */
import { Schema } from "effect";

/** Project-relative paths exclude traversal, drive letters, escapes and empty segments. */
export const SnapshotPath = Schema.String.check(
  Schema.isMaxLength(1024),
  Schema.isPattern(
    /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_@+.,()=-]+(?:\/[A-Za-z0-9_@+.,()=-]+)*$/,
  ),
);

/** Canonical SHA-256 identities compare content rather than filesystem timestamps. */
export const SnapshotHash = Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/));

/** One inventoried member has a bounded size and a hash over its complete bytes. */
export const SnapshotMember = Schema.Struct({
  path: SnapshotPath,
  hash: SnapshotHash,
  bytes: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 67_108_864 })),
});

/** Resolution probes may contain POSIX colons, but never drives, escapes or traversal. */
export const SnapshotResolutionPath = Schema.String.check(
  Schema.isMaxLength(1024),
  Schema.isPattern(
    /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_@+.,():=-]+(?:\/[A-Za-z0-9_@+.,():=-]+)*$/,
  ),
);

/** Native directory basenames are compared as data and never joined into paths. */
const SnapshotDirectoryEntry = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1024),
  Schema.isPattern(/^[^/\0]+$/),
);

/** Directory roots use dot; negative resolution paths include native builtin probes. */
export const SnapshotTypecheckObservation = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["fileExists", "directoryExists"]),
    path: Schema.Union([SnapshotResolutionPath, Schema.Literal(".")]),
    exists: Schema.Boolean,
  }),
  Schema.Struct({
    kind: Schema.Literals(["directories", "entries"]),
    path: Schema.Union([SnapshotResolutionPath, Schema.Literal(".")]),
    entries: Schema.Array(SnapshotDirectoryEntry).check(Schema.isMaxLength(20_000)),
  }),
]);

/** Consumed checker bytes and negative resolution witnesses belong to one successful check. */
export const SnapshotTypecheckInputs = Schema.Struct({
  files: Schema.Array(SnapshotMember).check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
  observations: Schema.Array(SnapshotTypecheckObservation).check(Schema.isMaxLength(50_000)),
});

/** Runnable dependency content is indexed independently from its package version. */
export const SnapshotDependency = Schema.Struct({
  name: Schema.String.check(
    Schema.isMaxLength(256),
    Schema.isPattern(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/),
  ),
  version: Schema.String.check(Schema.isMaxLength(128)),
  root: SnapshotPath,
  members: Schema.Array(SnapshotMember).check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
});

/** Cohort fields mirror runtime activation while enforcing canonical content hashes. */
export const SnapshotActivation = Schema.Struct({
  graphHash: SnapshotHash,
  manifestHash: SnapshotHash,
  jobsManifestHash: Schema.optionalKey(SnapshotHash),
  runtimeIntegrationsPlanHash: SnapshotHash,
  localServicesPlanHash: Schema.optionalKey(SnapshotHash),
});

/** All runtime-affecting versions participate in snapshot compatibility. */
export const SnapshotTools = Schema.Struct({
  bun: Schema.String.check(Schema.isMaxLength(128)),
  effect: Schema.String.check(Schema.isMaxLength(128)),
  typescript: Schema.String.check(Schema.isMaxLength(128)),
  relkit: Schema.String.check(Schema.isMaxLength(128)),
  platform: Schema.Literals(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]),
});

/** Example probes execute a safe normal route; empty examples require live graph proof. */
export const SnapshotReadiness = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("route"),
    path: Schema.String.check(Schema.isMaxLength(2048), Schema.isPattern(/^\/(?!\/)[^\s#]*$/)),
    status: Schema.Literal(200),
    body: Schema.String.check(Schema.isMaxLength(65_536)),
  }),
  Schema.Struct({ kind: Schema.Literal("graph"), routeTableHash: SnapshotHash }),
]);

/** HTTP shape selected only after the graph's complete owning validation succeeds. */
export const SnapshotRouteProjection = Schema.Struct({
  method: Schema.String,
  path: Schema.String,
});

/** Executable partitions refer only to members verified before activation. */
export const SnapshotRouteImport = Schema.Struct({
  routeId: Schema.String.check(Schema.isMaxLength(512)),
  members: Schema.Array(SnapshotPath).check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
});

/** Portable receipt; no environment values, absolute roots or process identity are encoded. */
export const DevSnapshot = Schema.Struct({
  version: Schema.Literal(1),
  fingerprint: SnapshotHash,
  graphHash: SnapshotHash,
  graphFile: SnapshotPath,
  activationFile: SnapshotPath,
  manifestFile: SnapshotPath,
  runtimeIntegrationsFile: SnapshotPath,
  jobsManifestFile: Schema.optionalKey(SnapshotPath),
  localServicesFile: Schema.optionalKey(SnapshotPath),
  entrypoint: SnapshotPath,
  importIndex: SnapshotPath,
  activation: SnapshotActivation,
  tools: SnapshotTools,
  ports: Schema.optionalKey(
    Schema.Struct({
      backend: Schema.Number.check(
        Schema.isInt(),
        Schema.isBetween({ minimum: 1, maximum: 65_535 }),
      ),
      inspector: Schema.Number.check(
        Schema.isInt(),
        Schema.isBetween({ minimum: 1, maximum: 65_535 }),
      ),
    }),
  ),
  readiness: SnapshotReadiness,
  inputs: Schema.Array(SnapshotMember).check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
  typecheckInputs: SnapshotTypecheckInputs,
  dependencies: Schema.Array(SnapshotDependency).check(Schema.isMaxLength(2_048)),
  artifacts: Schema.Array(SnapshotMember).check(Schema.isMinLength(6), Schema.isMaxLength(20_000)),
  routeImports: Schema.Array(SnapshotRouteImport).check(Schema.isMaxLength(10_000)),
});

/** Atomic current pointer identifies immutable receipt bytes, never a staging root. */
export const SnapshotPointer = Schema.Struct({
  version: Schema.Literal(1),
  generation: SnapshotHash,
});
