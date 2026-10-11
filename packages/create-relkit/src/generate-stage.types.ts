/**
 * Describes one creation transaction's private directory ownership. Publication
 * transfers the directory atomically; before that point the Scope owns cleanup.
 */
import type { Ref } from "effect";

/** A private creation stage and its publication state. */
export interface GenerationStage {
  readonly stage: string;
  readonly published: Ref.Ref<boolean>;
}
