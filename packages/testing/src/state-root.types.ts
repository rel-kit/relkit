/** Native temporary or caller-owned persistence path with idempotent cleanup. */
export interface TestStateRoot {
  readonly path: string;
  readonly cleanup: (failed: boolean) => void;
}
