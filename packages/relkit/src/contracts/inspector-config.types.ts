/**
 * Authored and resolved bridge settings as plain interfaces, so application declarations carry no
 * Effect types. `tests/contracts/inspector-config.types.test.ts` keeps them equal to the schemas
 * in `inspector-config.schemas.ts` that validate them.
 */

/** Bind address and port of the development bridge. */
export interface InspectorConnection {
  readonly host: string;
  readonly port: number;
}

/** Optional application input; installation of the standalone tool is independent. */
export interface InspectorConfigurationInput {
  /** Starts the bridge the Inspector connects to. Defaults to `false`. */
  readonly enabled?: boolean;
  /** Address the bridge listens on; port `0` takes a free port. */
  readonly connection?: { readonly host?: string; readonly port?: number };
  /** Largest payload preview the bridge returns, in bytes. Defaults to 1,048,576. */
  readonly maxPreviewBytes?: number;
}

/** Immutable bridge settings after validation and default application. */
export interface InspectorConfiguration {
  readonly enabled: boolean;
  readonly connection: InspectorConnection;
  readonly maxPreviewBytes: number;
}
