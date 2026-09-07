import type { AddRequest } from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import {
  addPublicMember,
  assertAvailableId,
  domainArtifact,
  resolveArtifact,
  sourceModule,
  type DomainArtifact,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureProviderProfile } from "./provider-planning.js";
import {
  constantsSource,
  errorSource,
  eventFunctionSource,
  eventSource,
  functionSource,
  jobSource,
  promptSource,
} from "./render-domain-sources.js";

export type RenderedArtifact = DomainArtifact;

export async function renderFunction(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  options: {
    readonly internal?: boolean;
    readonly error?: DomainArtifact;
    readonly event?: DomainArtifact;
  } = {},
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, nameValue, "functions", "function");
  assertAvailableId(builder, artifact.id);
  await builder.create(artifact.path, functionSource(artifact, options));
  register(builder, target, "function", artifact);
  if (!options.internal)
    await addPublicMember(builder, target, "functions", artifact, artifact.path);
  return artifact;
}

export async function renderError(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, nameValue, "errors", "error", "error");
  assertAvailableId(builder, artifact.id);
  await builder.create(artifact.path, errorSource(artifact));
  register(builder, target, "error", artifact);
  return artifact;
}

export async function renderEvent(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  options: { readonly internal?: boolean; readonly profile?: string } = {},
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, nameValue, "events", "event", "event");
  assertAvailableId(builder, artifact.id);
  const profile = await ensureProviderProfile(builder, "event", { requested: options.profile });
  await builder.create(artifact.path, eventSource(artifact, profile));
  register(builder, target, "event", artifact);
  if (!options.internal) await addPublicMember(builder, target, "events", artifact, artifact.path);
  return artifact;
}

export async function renderEventFunction(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "event-function" }>,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, request.name, "functions", "function");
  const event =
    target.service ||
    builder.artifacts.some(
      (item) => item.domain === target.domain.fileStem && item.kind === "event",
    )
      ? resolveArtifact(builder, target, "event", request.event)
      : await renderEvent(builder, target, request.event, {
          internal: false,
          ...(request.profile === undefined ? {} : { profile: request.profile }),
        });
  const profile = await ensureProviderProfile(builder, "event", { requested: request.profile });
  assertAvailableId(builder, artifact.id);
  await builder.create(
    artifact.path,
    eventFunctionSource(
      artifact,
      event.id ?? `${target.domain.idSegment}.${normalizeArtifactName(event.binding).idSegment}`,
      request.delivery,
      profile,
    ),
  );
  register(builder, target, "function", artifact);
  return artifact;
}

export async function renderJob(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "job" }>,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, request.name, "jobs", "job", "job");
  const functionTarget =
    target.service ||
    builder.artifacts.some(
      (item) => item.domain === target.domain.fileStem && item.kind === "function",
    )
      ? resolveArtifact(builder, target, "function", request.target)
      : await renderFunction(builder, target, request.target);
  const profile = await ensureProviderProfile(builder, "job", { requested: request.profile });
  assertAvailableId(builder, artifact.id);
  await builder.create(
    artifact.path,
    jobSource(artifact, functionTarget, sourceModule(functionTarget.path), profile),
  );
  register(builder, target, "job", artifact);
  return artifact;
}

export async function renderPrompt(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
  text: readonly string[],
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, nameValue, "prompts", "prompt", "prompt");
  assertAvailableId(builder, artifact.id);
  await builder.create(artifact.path, promptSource(artifact, text));
  register(builder, target, "prompt", artifact);
  return artifact;
}

export async function renderConstants(
  builder: PlanBuilder,
  target: DomainTarget,
  nameValue: string,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, nameValue, "constants", "constants", "constants");
  assertAvailableId(builder, artifact.id);
  await builder.create(artifact.path, constantsSource(artifact));
  register(builder, target, "constants", artifact);
  return artifact;
}

function register(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: "function" | "error" | "event" | "job" | "prompt" | "constants",
  artifact: RenderedArtifact,
): void {
  builder.registerArtifact(kind, {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
}
