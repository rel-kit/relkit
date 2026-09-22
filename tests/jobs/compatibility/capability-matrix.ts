import { resolve } from "node:path";

const matrixPath = new URL("./evidence/capability-matrix.json", import.meta.url);
const matrix = (await Bun.file(matrixPath).json()) as {
  readonly status: string;
  readonly evidence: readonly string[];
  readonly requiredCommonSubset: {
    readonly minimumNativeEngines: number;
    readonly nativeEnginesProven: readonly string[];
    readonly diagnostic: string;
  };
  readonly variants: readonly {
    readonly evidence: readonly string[];
  }[];
};

if (matrix.evidence.length === 0)
  throw new Error("capability matrix must link executable evidence");
if (matrix.requiredCommonSubset.diagnostic.length === 0) {
  throw new Error("capability matrix must include an actionable diagnostic");
}

const evidencePaths = new Set([...matrix.evidence, ...matrix.variants.flatMap((v) => v.evidence)]);
for (const path of evidencePaths) {
  if (!(await Bun.file(new URL(`../../../${path}`, import.meta.url)).exists())) {
    throw new Error(`Missing evidence: ${path}`);
  }
}

const staticGateOpen =
  matrix.status === "ready" &&
  matrix.requiredCommonSubset.nativeEnginesProven.length >=
    matrix.requiredCommonSubset.minimumNativeEngines;
const dockerEnabled = process.env.RELKIT_TEST_DOCKER === "1";
let providerExitCode: number | undefined;
if (staticGateOpen && dockerEnabled) {
  const child = Bun.spawn([process.execPath, "run", "test:jobs:providers"], {
    cwd: resolve(import.meta.dir, "../../.."),
    stdout: "inherit",
    stderr: "inherit",
  });
  providerExitCode = await child.exited;
}
const gateOpen = staticGateOpen && (!dockerEnabled || providerExitCode === 0);
const result = {
  status: gateOpen ? "ready" : "blocked",
  requiredNativeEngines: matrix.requiredCommonSubset.minimumNativeEngines,
  provenNativeEngines: matrix.requiredCommonSubset.nativeEnginesProven,
  diagnostic: gateOpen
    ? undefined
    : providerExitCode !== undefined && providerExitCode !== 0
      ? `Native provider suite failed with exit code ${providerExitCode}.`
      : matrix.requiredCommonSubset.diagnostic,
  providerSuite: dockerEnabled
    ? providerExitCode === 0
      ? "passed"
      : "failed"
    : "skipped; Docker gate not enabled",
};
console.error(JSON.stringify(result, null, 2));
if (!gateOpen) process.exitCode = 1;
