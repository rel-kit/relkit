import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type { InspectorJobsBinding } from "./types.js";
import type { NativeRunPage } from "./native.types.js";

/** Canonical native count evidence, preserving the weakest selected page accuracy. */
export type AggregateCount = NonNullable<RunPage<RunSnapshot>["count"]>;

/** Page and availability evidence required by the pure aggregate count calculation. */
export type AggregateCountPage = Pick<NativeRunPage, "page" | "state">;

/** Per-service continuation state retaining consumed runs and truthful availability evidence. */
export interface Checkpoint {
  readonly service: string;
  readonly generation: string;
  readonly cursor?: string;
  readonly consumed: readonly string[];
  readonly blocked?: boolean;
  readonly exhausted?: boolean;
}

/** Ordered authoritative native service checkpoints stored in the signed aggregate cursor. */
export interface AggregatePosition {
  readonly services: readonly Checkpoint[];
}

/** Native run and owning binding retained for deterministic aggregate merge ordering. */
export interface Candidate {
  readonly binding: InspectorJobsBinding;
  readonly run: RunSnapshot;
  readonly key: string;
}
