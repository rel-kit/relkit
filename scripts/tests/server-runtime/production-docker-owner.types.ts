/** Defines exact fixture-owned Docker identities and the creation receipt used during cleanup. */

/** Unique fixture identities never select an unrelated Docker object. */
export interface DockerOwner {
  /** UUID-qualified buildx builder name allocated by the proof. */
  readonly builder: string;
  /** Unique image tag produced only by the fixture builder. */
  readonly image: string;
  /** Exact runtime container name allocated by the proof. */
  readonly container: string;
  /** Becomes true after builder creation succeeds, before bootstrapping it. */
  builderCreated: boolean;
}
