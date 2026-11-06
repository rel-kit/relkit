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
  readonly enabled?: boolean;
  readonly connection?: { readonly host?: string; readonly port?: number };
  readonly maxPreviewBytes?: number;
}

/** Immutable bridge settings after validation and default application. */
export interface InspectorConfiguration {
  readonly enabled: boolean;
  readonly connection: InspectorConnection;
  readonly maxPreviewBytes: number;
}
