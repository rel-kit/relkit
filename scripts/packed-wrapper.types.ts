/** Captures isolated candidate package-runner inputs for the packed `relkit` launcher smoke. */

/** One actual installed package runner and its fixture-owned native cache. */
export interface PackedWrapperRunner {
  readonly name: "bun" | "npm";
  readonly executable: "bun" | "node";
  readonly prefix: readonly string[];
  readonly cache: string;
}

/** Exact candidate identities and isolated command environment shared by the launcher smoke. */
export interface PackedWrapperContext {
  readonly temporary: string;
  readonly consumer: string;
  readonly registry: string;
  readonly env: Readonly<Record<string, string>>;
  readonly wrapperVersion: string;
  /** Runtime dependencies of the packed `relkit` manifest, which every runner must install as-is. */
  readonly wrapperDependencies: Readonly<Record<string, string>>;
  readonly creatorVersion: string;
  readonly cliVersion: string;
  readonly npmScript: string;
  readonly npxScript: string;
  readonly npmVersion: string;
}
