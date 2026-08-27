import { canonicalJson } from "@relkit/contracts";
import {
  writeGeneratedArtifacts,
  type GeneratedOutputs,
  type LoadedToolingConfig,
} from "@relkit/compiler";
import { createDiagnostic, sortDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { emptyCheckOutputs, safeMessage } from "./check-support.js";

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

export async function emitCheckResult(
  projectRoot: string,
  generatedDirectory: string,
  diagnostics: readonly Diagnostic[],
  outputs: GeneratedOutputs = emptyCheckOutputs(diagnostics),
  graphHash?: string,
  config?: LoadedToolingConfig,
): Promise<CheckResult> {
  let stable = sortDiagnostics(diagnostics);
  let nextOutputs =
    outputs.diagnostics === ""
      ? { ...outputs, diagnostics: `${canonicalJson(stable)}\n` }
      : outputs;
  try {
    await writeGeneratedArtifacts(nextOutputs, { directory: generatedDirectory });
  } catch (error) {
    stable = sortDiagnostics([
      ...stable,
      createDiagnostic({
        code: "RELKIT_ARTIFACT_WRITE_FAILED",
        severity: "error",
        message: safeMessage(error, projectRoot),
      }),
    ]);
    nextOutputs = { ...nextOutputs, diagnostics: `${canonicalJson(stable)}\n` };
  }
  const hasErrors = stable.some((diagnostic) => diagnostic.severity === "error");
  return Object.freeze({
    ok: !hasErrors,
    activatable: !hasErrors && nextOutputs.manifest !== "",
    projectRoot,
    generatedDirectory,
    ...(graphHash === undefined ? {} : { graphHash }),
    ...(config === undefined ? {} : { config }),
    diagnostics: Object.freeze(stable),
    outputs: nextOutputs,
  });
}
