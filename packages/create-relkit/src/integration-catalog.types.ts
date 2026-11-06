/** Describes one entry of the integration catalog bundled into the creator. */

/** A released integration package and its maturity tier. */
export interface BundledIntegration {
  /** Integration id from the package's `relkit.integration.id`. */
  readonly id: string;
  /** Published package name. */
  readonly package: string;
  /** Core or Labs tier from the package's `relkit.maturity`. */
  readonly maturity: "core" | "labs";
}
