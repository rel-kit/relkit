import type { EnvDefinition, EnvShape, EnvSource, EnvIssue } from "@relkit/config";

/** Secret-free status of one declared environment field. */
export type EnvStatus = "set" | "default" | "optional" | "missing" | "invalid";
/** Parsed environment arguments with explicit optional overrides. */
export interface ParsedEnvArgs {
  readonly command: "check" | "example" | "explain" | "list";
  readonly name?: string;
  readonly environment?: string;
  readonly projectRoot?: string;
  readonly examplePath?: string;
  readonly write: boolean;
}
/** Public environment command injection and path settings. */
export interface EnvCommandOptions {
  readonly projectRoot?: string;
  readonly definition?: EnvDefinition<EnvShape>;
  readonly source?: EnvSource;
  readonly environment?: string;
  readonly envPath?: string;
  readonly examplePath?: string;
}
/** Public issue projection deliberately excludes raw values and parser messages. */
export type SafeEnvIssue = Pick<EnvIssue, "name" | "code" | "sensitive"> & {
  readonly message: string;
};
/** Existing safe check/list projection. */
export interface EnvStatusResult {
  readonly ok: boolean;
  readonly items: readonly { readonly name: string; readonly status: EnvStatus }[];
  readonly issues: readonly SafeEnvIssue[];
}
/** Existing example output shape; content contains redacted placeholders only. */
export interface EnvExampleResult {
  readonly ok: true;
  readonly command: "example";
  readonly path: string;
  readonly existing: boolean;
  readonly written: boolean;
  readonly content: string;
}
/** Human check formatting inputs. */
export interface EnvCheckPresentation {
  readonly ok: boolean;
  readonly environment: string;
  readonly items: readonly { readonly name: string; readonly status: EnvStatus }[];
}
/** Human explain formatting inputs, without defaults or resolved values. */
export interface EnvExplainPresentation {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly required: boolean;
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
}
