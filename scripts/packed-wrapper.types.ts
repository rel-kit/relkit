/** Captures isolated candidate package-runner inputs without importing the application CLI. */

/** One actual installed package runner and its fixture-owned native cache. */
export interface PackedWrapperRunner {
  readonly name: "bun" | "npm";
  readonly executable: "bun" | "node";
  readonly prefix: readonly string[];
  readonly cache: string;
}

/** Exact candidate identities and isolated command environment shared by the wrapper smoke. */
export interface PackedWrapperContext {
  readonly temporary: string;
  readonly consumer: string;
  readonly registry: string;
  readonly env: Readonly<Record<string, string>>;
  readonly wrapperVersion: string;
  readonly creatorVersion: string;
  readonly cliVersion: string;
  readonly npmScript: string;
  readonly npxScript: string;
  readonly npmVersion: string;
}
