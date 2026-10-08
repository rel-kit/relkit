import type { EnvDefinition, EnvProjection, EnvShape } from "@relkit/config";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { EnvCommandOptions, EnvExampleResult } from "./env.types.js";

/** Project environment declaration and example-file authority. */
export interface EnvironmentProjectOperations {
  /**
   * Loads an opaque owner declaration while retaining native callbacks and identity.
   * @param options - Injected definition or contained module selection.
   * @returns Lazy definition; the config package owns complete declaration validation.
   */
  readonly load: (
    options: Pick<EnvCommandOptions, "definition" | "projectRoot" | "envPath">,
  ) => Effect.Effect<EnvDefinition<EnvShape>, CliAdapterError>;
  /**
   * Produces or explicitly writes one redacted example file.
   * @param fields - Value-free metadata from the config owner.
   * @param options - Root and optional example path.
   * @param write - Explicit overwrite authorization.
   * @returns Lazy example output after any physical write settles.
   */
  readonly example: (
    fields: readonly EnvProjection[],
    options: Pick<EnvCommandOptions, "projectRoot" | "examplePath">,
    write: boolean,
  ) => Effect.Effect<EnvExampleResult, CliAdapterError>;
}
