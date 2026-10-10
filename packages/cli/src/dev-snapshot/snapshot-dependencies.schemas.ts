/**
 * Decodes pinned Bun's data-only bundle input inventory and installed package
 * identity. Metafile paths are untrusted until root-relative containment checks;
 * no absolute metadata or import source is copied into a portable receipt.
 */
import { Schema } from "effect";
import { SnapshotDependency } from "./snapshot.schemas.js";

/** Bun input records describe files actually consumed by the completed bundle. */
export const SnapshotBundleInputs = Schema.Struct({
  inputs: Schema.Record(
    Schema.String.check(Schema.isMaxLength(4096)),
    Schema.Struct({
      bytes: Schema.Number.check(
        Schema.isInt(),
        Schema.isBetween({ minimum: 0, maximum: 67_108_864 }),
      ),
    }),
  ),
});

/** Package versions participate alongside full executable member byte identity. */
export const SnapshotInstalledPackage = Schema.Struct({
  name: SnapshotDependency.fields.name,
  version: SnapshotDependency.fields.version,
});
