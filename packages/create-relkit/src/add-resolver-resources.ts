import { usage } from "./add-options-parser.js";
import { bucketProfileOwners } from "./bucket-profiles.js";
import {
  artifactOptions,
  artifacts,
  profiles,
  selectedDomain,
} from "./add-resolution-discovery.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

export async function resolveResourceOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  const kind = state.parsed.kind;
  if (kind === "cache" || kind === "bucket") await providerSource(state, discovery, kind);
  else if (kind === "tool") await toolOptions(state, discovery);
  else if (kind === "agent") await agentOptions(state, discovery);
}

async function providerSource(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
  capability: "cache" | "bucket",
): Promise<void> {
  if (state.has("profile") || state.has("provider") || state.has("source")) return;
  const owners = capability === "bucket" ? await bucketProfileOwners(discovery) : new Map();
  const existing = profiles(discovery, capability).filter((profile) => !owners.has(profile.name));
  const local = capability === "cache" ? "redis:docker" : "s3:docker";
  const connected = capability === "cache" ? "redis:connected" : "s3:connected";
  const cloudflare = capability === "cache" ? "cloudflare-kv:connected" : "cloudflare-r2:connected";
  if (!state.interactive) {
    const preferred =
      existing.find((profile) => profile.isDefault) ??
      (existing.length === 1 ? existing[0] : undefined);
    if (preferred) state.option("profile", preferred.name);
    else {
      const [provider, source] = local.split(":");
      state.option("provider", provider!);
      state.option("source", source!);
    }
    return;
  }
  const value = await state.select(
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
  if (value.startsWith("profile:")) state.option("profile", value.slice(8));
  else {
    const [provider, source] = value.split(":");
    state.option("provider", provider!);
    state.option("source", source!);
  }
}

async function toolOptions(state: AddResolutionState, discovery: ProjectDiscovery): Promise<void> {
  if (!state.has("target")) {
    const values = artifacts(discovery, selectedDomain(state, discovery), "function");
    if (!state.interactive && values.length === 1)
      state.option("target", values[0]!.id ?? values[0]!.binding);
    else if (state.parsed.createService) {
      const value = await state.text("Callable function name to create", "Example", true);
      if (value) state.option("target", value);
    } else {
      const value = await state.select("Callable function target", artifactOptions(values));
      if (value) state.option("target", value);
    }
  }
  if (!state.has("side-effect")) {
    const value = await state.select(
      "Side effect",
      choices(["none", "read", "write", "external"]),
      "read",
    );
    if (value) state.option("side-effect", value);
  }
  if (!state.has("approval")) {
    const value = await state.select(
      "Approval policy",
      choices(["never", "on-write", "always"]),
      "never",
    );
    if (value) state.option("approval", value);
  }
}

async function agentOptions(state: AddResolutionState, discovery: ProjectDiscovery): Promise<void> {
  const domain = selectedDomain(state, discovery);
  if (!state.has("model") && !state.has("model-provider") && !state.has("model-id")) {
    const models = profiles(discovery, "model");
    const preferred =
      models.find((profile) => profile.isDefault) ?? (models.length === 1 ? models[0] : undefined);
    if (!state.interactive && preferred) state.option("model", modelValue(preferred));
    else if (state.interactive) await selectModel(state, models);
  }
  if (!state.has("tool")) {
    const tools = artifacts(discovery, domain, "tool");
    if (tools.length > 0) {
      const values = await state.multiselect("Tools to include", artifactOptions(tools));
      if (values) state.repeated("tool", values);
    }
  }
  if (state.has("prompt") || state.has("instructions")) return;
  const promptValues = artifacts(discovery, domain, "prompt");
  if (!state.interactive && promptValues.length === 1) {
    state.option("prompt", promptValues[0]!.id ?? promptValues[0]!.binding);
    return;
  }
  if (!state.interactive) return;
  const inline = "__inline__";
  const selected = await state.select(
    "Agent instructions",
    [...artifactOptions(promptValues), { value: inline, label: "Inline instructions" }],
    inline,
  );
  if (selected === inline) {
    const text = await state.text("Instructions");
    if (text) state.option("instructions", text);
  } else if (selected) state.option("prompt", selected);
}

async function selectModel(
  state: AddResolutionState,
  models: ReturnType<typeof profiles>,
): Promise<void> {
  const create = "__create__";
  const preferred = models.find((profile) => profile.isDefault) ?? models[0];
  const selected = await state.select(
    "Model",
    [
      ...models.map((profile) => ({
        value: modelValue(profile),
        label: modelValue(profile),
        ...(profile.isDefault ? { hint: "configured default" } : {}),
      })),
      { value: create, label: "Configure a model provider" },
    ],
    preferred ? modelValue(preferred) : create,
  );
  if (selected !== create) {
    if (selected) state.option("model", selected);
    return;
  }
  const provider = await state.select("Model provider", choices(["openai", "anthropic"]), "openai");
  const modelId = await state.text(
    "Model ID",
    provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-5-mini",
  );
  if (!provider || !modelId) usage("A model provider and model ID are required.");
  state.option("model-provider", provider);
  state.option("model-id", modelId);
}

function modelValue(profile: { readonly name: string; readonly modelId?: string }): string {
  return profile.modelId ? `${profile.name}:${profile.modelId}` : profile.name;
}
