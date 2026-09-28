/** Listener and abort state owned for one native submission. */
export interface SubmissionWriteRegistration {
  readonly aborted: Promise<void>;
  readonly isAborted: () => boolean;
  readonly dispose: () => void;
}
