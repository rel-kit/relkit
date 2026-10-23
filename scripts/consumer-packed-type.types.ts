/** Describes actual independent type consumer selections and their checked source files. */
import type { ConsumerFixture } from "./consumer-benchmark.types.js";
import type { Schema } from "effect";
import type { PackedTypeCatalog } from "./consumer-packed-type.schemas.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";

/** Validated native dependency and patch metadata from the packed creator. */
export type PackedTypeCatalogValue = Schema.Schema.Type<typeof PackedTypeCatalog>["buildCatalog"];

/** Actual independent installation evidence after native strict compilation succeeds. */
export interface PackedTypeResult {
  readonly name: string;
  readonly manager: "bun" | "bun-isolated";
  readonly root: string;
  readonly cases: number;
  readonly installation: ConsumerInstallation;
}

/** A native installation and all declaration outcomes that it must establish. */
export interface PackedTypeFixture extends ConsumerFixture {
  /** Public TypeScript source compiled against this consumer's native installation. */
  readonly source: string;
  /** Session or native model result misuse must produce exactly TS2322, without unrelated diagnostics. */
  readonly negativeSource?: string;
  /** Exact native diagnostic sequence required by a negative case; defaults to TS2322. */
  readonly negativeDiagnosticCodes?: readonly number[];
  /** Optional finite native public import smoke, evaluated from the installed consumer. */
  readonly runtimeSource?: string;
  /** Installed package identities forbidden by this explicitly selected capability. */
  readonly forbidden: RegExp;
  /** Selected Drizzle consumers receive the exact creator-owned upstream patch. */
  readonly drizzle: boolean;
  /** Backend auth consumers receive the official fetch repair and required declaration peer. */
  readonly auth: boolean;
}
