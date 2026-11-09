/** Contracts of the development handler table and its reload hook. */
import type { ApplicationGraph } from "../graph/index.js";

/** A handler as the generated server stores it: a function or a handler-bearing descriptor. */
export type SwappableHandler = object;

/**
 * The function registry shape the engine's verified registry has; declared structurally
 * here because `relkit/host` may not depend on the engine.
 */
export interface SwappableRegistry extends ReadonlyMap<string, SwappableHandler> {
  readonly graphHash: string;
  readonly functionIds: readonly string[];
  readonly handlers: Readonly<Record<string, SwappableHandler>>;
  readonly targets: Readonly<Record<string, object>>;
}

/** The manifest maps the running server reads handlers and targets from. */
export interface SwappableManifest {
  readonly functions?: Record<string, SwappableHandler>;
  readonly targets?: Record<string, object>;
}

/** Manifest maps that a reload must leave untouched; a re-evaluated entry forces a restart. */
export interface ReloadedManifest extends SwappableManifest {
  readonly middleware?: Readonly<Record<string, object>>;
  readonly hooks?: Readonly<Record<string, object>>;
  readonly requestTransforms?: Readonly<Record<string, object>>;
  readonly agents?: Readonly<Record<string, object>>;
  readonly tools?: Readonly<Record<string, object>>;
  readonly channels?: Readonly<Record<string, object>>;
  readonly tasks?: Readonly<Record<string, object>>;
  readonly jobs?: Readonly<Record<string, object>>;
  readonly application?: object;
}

/** A stable registry whose table can be replaced atomically. */
export interface HandlerTable {
  /** Registry object handed to invocation; it always delegates to the current table. */
  readonly registry: SwappableRegistry;
  /** Number of swaps applied since startup. */
  readonly generation: number;
  /**
   * Replaces the registry and the manifest's function and target entries in one step.
   * @param next - Registry verified against the new graph and manifest.
   * @param manifest - The new generation's manifest maps.
   */
  readonly swap: (next: SwappableRegistry, manifest: SwappableManifest) => void;
}

/** A request from `relkit dev` to load a new handler table. */
export interface DevelopmentReloadRequest {
  readonly type: "relkit.dev.reload";
  /** Correlates the acknowledgement. */
  readonly id: number;
  /** Manifest module file name in the server directory. */
  readonly manifest: string;
  /** Graph JSON file name in the server directory. */
  readonly graph: string;
}

/** The server's answer to a reload request. */
export type DevelopmentReloadReply =
  | {
      readonly type: "relkit.dev.reloaded";
      readonly id: number;
      readonly ok: true;
      /** Application modules evaluated again, project-relative. */
      readonly reimported: readonly string[];
      readonly pid: number;
    }
  | {
      readonly type: "relkit.dev.reloaded";
      readonly id: number;
      readonly ok: false;
      readonly error: string;
      readonly pid: number;
    };

/** Inputs the generated server supplies to the reload hook. */
export interface DevelopmentReloadOptions {
  readonly projectRoot: string;
  /** Directory of the running server's `index.ts`. */
  readonly serverDirectory: string;
  readonly table: HandlerTable;
  /** Manifest the server started with; later reloads compare against the last one applied. */
  readonly runtimeManifest: ReloadedManifest;
  /**
   * Verifies a graph and manifest pair the same way startup does.
   * @param graph - Graph of the new generation.
   * @param manifest - Manifest module's `runtimeManifest` export.
   * @returns The verified registry.
   */
  readonly createRegistry: (
    graph: ApplicationGraph,
    manifest: SwappableManifest,
  ) => SwappableRegistry;
}
