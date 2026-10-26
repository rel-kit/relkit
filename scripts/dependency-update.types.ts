/** Shares decoded dependency inputs between catalog policy, CI preparation and trusted artifact admission. */
import type { Schema } from "effect";
import type { DependencyBundle, DependencyManifest } from "./dependency-update.schemas.js";

/** Relevant manifest declarations, validated before ownership decisions. */
export type DependencyManifestData = Schema.Schema.Type<typeof DependencyManifest>;

/** Original and proposed declarations for one dependency update. */
export interface ManifestChange {
  readonly before: DependencyManifestData;
  readonly after: DependencyManifestData;
}

/** Bounded, validated CI data rather than an executable archive. */
export type DependencyBundleData = Schema.Schema.Type<typeof DependencyBundle>;
