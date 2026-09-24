import type { Effect } from "effect";

/** Stable, bounded names for environment configuration operations. */
export type ConfigOperation =
  | "define"
  | "resolve"
  | "resolve-provider"
  | "project"
  | "is-ref"
  | "create-ref"
  | "json-value"
  | "parse-number"
  | "parse-port"
  | "parse-boolean"
  | "parse-literal"
  | "builder-create"
  | "builder-get-default"
  | "builder-parse"
  | "builder-literal"
  | "builder-or-binding"
  | "parse-url"
  | "parse-json"
  | "builder-default"
  | "builder-optional"
  | "builder-required-in"
  | "builder-description"
  | "builder-example";

/** Substitutable observer used by the config Effect operations. */
export interface ConfigTelemetryService {
  /** Observe one operation without changing its success or error.
   * @param operation - Stable bounded operation name.
   * @param effect - Effect to instrument.
   * @returns The original Effect success and error channels.
   * @example observe("resolve", Effect.succeed({ MODE: "test" }));
   */
  readonly observe: <A, E, R>(
    operation: ConfigOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
