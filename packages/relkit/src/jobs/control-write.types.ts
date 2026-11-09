/** Lifetime of one registered abort listener for a native control write. */
export interface ControlWriteRegistration {
  readonly aborted: Promise<void>;
  readonly isAborted: () => boolean;
  readonly dispose: () => void;
}
