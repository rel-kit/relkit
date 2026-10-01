import type { Data } from "effect";
import type { ConfigIssue, LoadedToolingConfig } from "./config-loader-types.js";

/** Private parse decision; successful configuration is always present in the accepted case. */
export type ParsedConfig = Data.TaggedEnum<{
  Accepted: { readonly config: LoadedToolingConfig; readonly issues: readonly ConfigIssue[] };
  Rejected: { readonly issues: readonly ConfigIssue[] };
}>;
