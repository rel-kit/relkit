/** Owned native storage subdirectory and idempotent temporary-parent cleanup. */
export interface TestFakeRoot {
  readonly stateRoot: string;
  readonly cleanup: (failed: boolean) => void;
}
