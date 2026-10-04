/** Settled-once first-snapshot Promise with explicit resolve and reject functions. */
export type Pending = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};
