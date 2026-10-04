import type { RuntimeActivationFingerprint } from "@relkit/contracts";

/** Selective generation fields retained by the original observable-record assertions. */
export interface ObservableGenerationFixture {
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly event: string;
}
