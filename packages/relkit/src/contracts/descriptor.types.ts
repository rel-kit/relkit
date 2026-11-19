import type { RELKIT_DESCRIPTOR } from "./descriptor.js";
import type { DescriptorKind, Ref } from "./id.types.js";

/** Common serializable metadata shared by all public descriptors. */
export interface DescriptorMetadata {
  /** Short name for people, shown in the Inspector and the API reference. */
  readonly title?: string;
  /** What it is for, in a sentence or two; shown where the title is. */
  readonly description?: string;
  /** Labels that group it in the Inspector and the API reference. */
  readonly tags?: readonly string[];
}

/** The immutable common shape implemented by every public descriptor. */
export interface DescriptorBase<
  Kind extends DescriptorKind,
  Id extends string = string,
> extends DescriptorMetadata {
  readonly [RELKIT_DESCRIPTOR]: true;
  readonly kind: Kind;
  readonly id: Id;
  readonly ref: Ref<Kind, Id>;
}

/** A descriptor whose concrete kind and ID are not known by the caller. */
export type DescriptorAny = DescriptorBase<DescriptorKind, string>;
