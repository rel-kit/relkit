import type { ApplicationEnv, DrizzleModelMap, DrizzleOverrides, TablesOf } from "./types.js";

/**
 * Lazy authoring options preserving native client and model extension inference.
 * @typeParam Client - Acquired native client type.
 * @typeParam Schema - Authored schema containing supported Drizzle tables.
 * @typeParam Models - Table-specific authored extensions.
 */
export interface DefineDrizzleServiceOptions<
  Client,
  Schema extends Readonly<Record<string, unknown>>,
  Models extends DrizzleModelMap<TablesOf<Schema>>,
> {
  readonly id?: string;
  readonly schema: Schema;
  /**
   * Acquires a native client when the owner Layer is first built.
   * @param context - First activation environment.
   * @returns Native client or acquisition Promise; failures retain native identity.
   */
  readonly client: (context: { readonly env: ApplicationEnv }) => Client | Promise<Client>;
  readonly models?: Models;
  readonly overrides?: DrizzleOverrides<TablesOf<Schema>>;
  /**
   * Releases the owned native client once admitted work has drained.
   * @param database - Successfully acquired client.
   * @returns Optional native completion; failure remains visible at close.
   */
  readonly dispose?: (database: Client) => unknown | Promise<unknown>;
}
