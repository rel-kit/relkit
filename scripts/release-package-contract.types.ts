/**
 * Models exact release export conditions consumed by manifest comparisons.
 * Each target names package-contained bytes; these types confer no execution
 * authority and permit only conditions already used by RELKIT packages.
 */

/** Declaration plus the supported native/ESM compatibility conditions. */
export interface ReleaseExportConditions {
  readonly types: string;
  readonly import?: string;
  readonly default?: string;
  readonly require?: string;
  readonly bun?: string;
}

/** Exact subpath-to-condition mapping compared with each packed manifest. */
export type ReleaseExports = Readonly<Record<string, ReleaseExportConditions>>;
