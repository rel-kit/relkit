import type { ServiceInclude } from "./add-types.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";
import {
  artifactOptions,
  artifacts,
  profiles,
  selectedDomain,
} from "./add-resolution-discovery.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

const INCLUDES: readonly ServiceInclude[] = [
  "function",
  "error",
  "event",
  "event-function",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
  "route",
];

export async function resolveDomainOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  const kind = state.parsed.kind;
  if (kind !== "database" && kind !== "auth" && kind !== "route") {
    await ensureName(state);
  }
  if (kind === "service") await serviceOptions(state);
  else if (kind === "function") await visibility(state);
  else if (kind === "event") {
    await visibility(state);
    await providerProfile(state, discovery, "event");
  } else if (kind === "event-function") {
    await eventFunctionOptions(state, discovery);
  } else if (kind === "job") await jobOptions(state, discovery);
  else if (kind === "prompt" && !state.has("text")) await promptText(state);
}

async function promptText(state: AddResolutionState): Promise<void> {
  const values: string[] = [];
  do {
    const value = await state.text(values.length ? "Additional prompt text" : "Prompt text");
    if (value) values.push(value);
  } while (values.length > 0 && (await state.confirm("Add another prompt segment?", false)));
  state.repeated("text", values);
}

async function ensureName(state: AddResolutionState): Promise<void> {
  if (state.parsed.positional) return;
  const name = await state.text(`${state.parsed.kind.replaceAll("-", " ")} name`, undefined, true);
  if (name) state.positional(name);
}

async function serviceOptions(state: AddResolutionState): Promise<void> {
  if (state.has("full") || state.has("include")) return;
  const mode = await state.select(
    "Service contents",
    [
      { value: "simple", label: "Simple", hint: "service.ts and one public function" },
      { value: "custom", label: "Custom", hint: "choose domain artifacts" },
      { value: "full", label: "Full", hint: "complete coherent domain example" },
    ],
    "simple",
  );
  if (mode === "full") state.flag("full");
  if (mode === "custom") {
    const selected = await state.multiselect("Select service artifacts", choices(INCLUDES), true);
    if (selected) state.repeated("include", selected);
  }
}

async function visibility(state: AddResolutionState): Promise<void> {
  if (state.has("internal")) return;
  const exposed = await state.confirm("Expose this artifact through the service?", true);
  if (exposed === false) state.flag("internal");
}

async function eventFunctionOptions(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  if (!state.has("event")) {
    const values = artifacts(discovery, selectedDomain(state, discovery), "event");
    if (!state.interactive && values.length === 1)
      state.option("event", values[0]!.id ?? values[0]!.binding);
    else if (state.parsed.createService) {
      const value = await state.text("Event name to create", "Example", true);
      if (value) state.option("event", value);
    } else {
      const value = await state.select("Event to consume", artifactOptions(values));
      if (value) state.option("event", value);
    }
  }
  if (!state.has("delivery")) {
    const delivery = await state.select(
      "Delivery mode",
      choices(["durable", "transient"]),
      "durable",
    );
    if (delivery) state.option("delivery", delivery);
  }
  await providerProfile(state, discovery, "event");
}

async function jobOptions(state: AddResolutionState, discovery: ProjectDiscovery): Promise<void> {
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
  await providerProfile(state, discovery, "job");
}

async function providerProfile(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
  capability: "event" | "job",
): Promise<void> {
  if (state.has("profile") || !state.interactive) return;
  const existing = profiles(discovery, capability);
  const local = "__local__";
  const value = await state.select(`${capability} profile`, [
    ...existing.map((profile) => ({
      value: profile.name,
      label: profile.name,
      ...(profile.isDefault ? { hint: "configured default" } : {}),
    })),
    { value: local, label: "File-backed local", hint: "add @relkit/local" },
  ]);
  if (value) state.option("profile", value === local ? "local" : value);
}
