import type { DomainArtifact } from "./domain-planning.js";

/** Planned identity shared by domain artifact renderers. */
export type RenderedArtifact = DomainArtifact;

/** Function source relationships and public service exposure chosen by a normalized request. */
export interface RenderFunctionOptions {
  readonly internal?: boolean;
  readonly error?: DomainArtifact;
  readonly event?: DomainArtifact;
}

/** Event service exposure and provider profile chosen by a normalized request. */
export interface RenderEventOptions {
  readonly internal?: boolean;
  readonly profile?: string;
}
