import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorPrompt } from "./generator-prompt.js";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "./generator-errors.js";

import { bucketProfileOwnersEffect } from "./bucket-profiles.js";
import { profiles } from "./add-resolution-discovery.js";
import { AddResolutionState } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
/**
 * Resolves provider source through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @param capability - Requested provider capability.
 * @returns Completion after the cache/bucket provider and infrastructure source are recorded.
 */
export const providerSourceEffect = Effect.fn("AddResolution.providerSource")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
    capability: "cache" | "bucket",
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.has("profile") || state.has("provider") || state.has("source")) return;
    const owners =
      capability === "bucket" ? yield* bucketProfileOwnersEffect(discovery) : new Map();
    const existing = profiles(discovery, capability).filter((profile) => !owners.has(profile.name));
    const local = capability === "cache" ? "redis:docker" : "s3:docker";
    const connected = capability === "cache" ? "redis:connected" : "s3:connected";
    const cloudflare =
      capability === "cache" ? "cloudflare-kv:connected" : "cloudflare-r2:connected";
    if (!state.interactive) {
      const preferred =
        existing.find((profile) => profile.isDefault) ??
        (existing.length === 1 ? existing[0] : undefined);
      if (preferred) yield* state.optionEffect("profile", preferred.name);
      else {
        const [provider, source] = local.split(":");
        yield* state.optionEffect("provider", provider!);
        yield* state.optionEffect("source", source!);
      }
      return;
    }
    const value = yield* state.selectEffect(
      `${capability} provider`,
      [
        ...existing.map((profile) => ({
          value: `profile:${profile.name}`,
          label: profile.name,
          hint: profile.isDefault ? "configured default" : "existing profile",
        })),
        { value: local, label: capability === "cache" ? "Redis Docker" : "MinIO / S3 Docker" },
        { value: connected, label: capability === "cache" ? "Connected Redis" : "Connected S3" },
        ...(discovery.awsPulumiDeployment
          ? [
              {
                value: `${capability === "cache" ? "redis" : "s3"}:aws`,
                label: "Existing AWS / Pulumi deployment",
              },
            ]
          : []),
        {
          value: cloudflare,
          label: capability === "cache" ? "Connected Cloudflare KV" : "Connected Cloudflare R2",
        },
      ],
      local,
    );
    if (!value) return;
    if (value.startsWith("profile:")) yield* state.optionEffect("profile", value.slice(8));
    else {
      const [provider, source] = value.split(":");
      yield* state.optionEffect("provider", provider!);
      yield* state.optionEffect("source", source!);
    }
  },
  (effect) => observeExecution("generator", "add.resolve.providerSource", scaffoldErrors(effect)),
);
