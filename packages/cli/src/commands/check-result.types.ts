import type { GeneratedOutputs, LoadedToolingConfig } from "@relkit/compiler";
import type { Diagnostic } from "@relkit/diagnostics";

/** Compilation outcome; failed compilations never publish an activatable manifest. */
export interface CheckResult {
  readonly ok: boolean;
  readonly activatable: boolean;
  readonly projectRoot: string;
  readonly generatedDirectory: string;
  readonly graphHash?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly outputs: GeneratedOutputs;
  readonly config?: LoadedToolingConfig;
}
