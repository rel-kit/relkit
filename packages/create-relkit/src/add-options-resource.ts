import type { AddRequest } from "./add-types.js";
import { choice, one, optional, usage } from "./add-options-parser.js";

/**
 * Builds a cache or bucket request with mutually exclusive profile/provider selection.
 * @param common - Shared project, service and installation fields.
 * @param kind - Resource capability being requested.
 * @param name - Artifact name.
 * @param values - Parsed values grouped by flag name.
 * @returns The validated resource request with only explicitly supplied optional fields.
 */
export function resourceRequest(
  common: Omit<AddRequest, "kind">,
  kind: "cache" | "bucket",
  name: string,
  values: ReadonlyMap<string, readonly string[]>,
): Extract<AddRequest, { kind: "cache" | "bucket" }> {
  const profile = one(values, "profile");
  const provider = choice(
    one(values, "provider"),
    "provider",
    kind === "cache" ? ["redis", "cloudflare-kv"] : ["s3", "cloudflare-r2"],
  );
  const source = choice(one(values, "source"), "source", ["docker", "connected", "aws"]);
  if (profile && (provider || source)) {
    usage("--profile cannot be combined with --provider or --source.");
  }
  return {
    ...common,
    kind,
    name,
    ...optional("profile", profile),
    ...optional("provider", provider),
    ...optional("source", source),
  } as Extract<AddRequest, { kind: "cache" | "bucket" }>;
}
