import type { EnvMetadata, EnvShape, InferEnvValues } from "./env.types.js";

/** Explicit source values; resolution never reads the process environment.
 * @example const source: EnvSource = { MODE: "test" };
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Inputs for resolving an environment declaration.
 * @example const options: ResolveEnvOptions = { environment: "test", source: {} };
 */
export interface ResolveEnvOptions {
  readonly environment: string;
  readonly source: EnvSource;
}

/** One invalid or missing declared field.
 * Sensitive messages are redacted before an issue is exposed.
 * @example const issue: EnvIssue = { name: "MODE", code: "missing", message: "Required value is missing", sensitive: false };
 */
export interface EnvIssue {
  readonly name: string;
  readonly code: "missing" | "invalid";
  readonly message: string;
  readonly sensitive: boolean;
}

/** Immutable values inferred from a declaration shape.
 * @example type Values = ResolvedEnv<{ MODE: EnvBuilder<string> }>;
 */
export type ResolvedEnv<S extends EnvShape> = Readonly<InferEnvValues<S>>;

/** Public, value-free metadata for one field.
 * @example const fields: readonly EnvProjection[] = projectEnv(definition);
 */
export interface EnvProjection extends EnvMetadata {
  readonly name: string;
}
