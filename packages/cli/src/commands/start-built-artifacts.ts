/** Verifies auxiliary build artifacts and their sealed runtime activation identity. */
import { join } from "node:path";
import { Effect } from "effect";
import {
  canonicalJson,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import { createRuntimeActivationFingerprint } from "@relkit/compiler";
import { cliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { parseJobsManifest } from "./build-jobs.js";
import {
  expectVersion,
  parseArtifact,
  versionOf,
  expectGraphHash,
  validateLocalServices,
} from "./start-built-validation.js";
import type { BuiltManifest } from "./start-built.types.js";

/** Reads the fixed artifact cohort and validates its stored and recomputed fingerprints. */
export const validateBuiltArtifactsEffect = Effect.fn("BuiltProject.artifacts")(function* (
  buildDirectory: string,
  manifest: BuiltManifest,
  graphHash: string,
) {
  const runtimeManifest = yield* (yield* CliFileSystem).readText(
    join(buildDirectory, manifest.runtimeManifestFile),
  );
  const jobsManifestSource =
    manifest.jobsManifestFile === undefined
      ? undefined
      : yield* readArtifactEffect(buildDirectory, manifest.jobsManifestFile, "jobs manifest");
  yield* cliTry("start.jobs", () => parseJobsManifest(jobsManifestSource));
  const activationSource = yield* readArtifactEffect(
    buildDirectory,
    manifest.runtimeActivationFile,
    "activation fingerprint",
  );
  const activation = yield* cliTry("start.activation", () =>
    parseArtifact(activationSource, "activation fingerprint"),
  );
  if (!isRuntimeActivationFingerprint(activation))
    return yield* Effect.fail(
      cliAdapterError("start.built", new Error("Built activation fingerprint is invalid.")),
    );
  if (!isRuntimeActivationFingerprint(manifest.activationFingerprint))
    return yield* Effect.fail(
      cliAdapterError(
        "start.built",
        new Error("Built manifest activation fingerprint is invalid."),
      ),
    );
  const { runtimeIntegrations, localServices } = yield* readBuiltPlansEffect(
    buildDirectory,
    manifest,
    graphHash,
  );
  yield* validateBuiltFingerprintsEffect(manifest, activation, {
    graphHash,
    manifestSource: runtimeManifest,
    ...(jobsManifestSource === undefined ? {} : { jobsManifestSource }),
    runtimeIntegrationsPlanSource: runtimeIntegrations,
    ...(localServices === undefined ? {} : { localServicesPlanSource: localServices }),
    ...(activation.providerOverridesGeneration === undefined
      ? {}
      : { providerOverridesGeneration: activation.providerOverridesGeneration }),
  });
});

/** Checks auxiliary plan versions and graph identities in their established read order. */
const readBuiltPlansEffect = Effect.fn("BuiltProject.plans")(function* (
  buildDirectory: string,
  manifest: BuiltManifest,
  graphHash: string,
) {
  const runtimeIntegrations = yield* readArtifactEffect(
    buildDirectory,
    manifest.runtimeIntegrationsPlanFile,
    "runtime-integration plan",
  );
  const runtimeIntegrationPlan = yield* cliTry("start.integration.json", () =>
    parseArtifact(runtimeIntegrations, "runtime-integration plan"),
  );
  yield* cliTry("start.integration.version", () =>
    expectVersion(
      versionOf(runtimeIntegrationPlan),
      RUNTIME_INTEGRATION_PLAN_VERSION,
      "Built runtime-integration plan",
    ),
  );
  yield* cliTry("start.integration.hash", () =>
    expectGraphHash(runtimeIntegrationPlan, graphHash, "Built runtime-integration plan"),
  );
  const localServices =
    manifest.localServicesPlanFile === undefined
      ? undefined
      : yield* readArtifactEffect(
          buildDirectory,
          manifest.localServicesPlanFile,
          "local-service plan",
        );
  if (localServices !== undefined)
    yield* cliTry("start.local", () => validateLocalServices(localServices, graphHash));
  return { runtimeIntegrations, localServices };
});

/** Compares both persisted fingerprints before trusting the runtime manifest's graph seal. */
const validateBuiltFingerprintsEffect = Effect.fn("BuiltProject.fingerprints")(function* (
  manifest: BuiltManifest,
  activation: RuntimeActivationFingerprint,
  input: Parameters<typeof createRuntimeActivationFingerprint>[0],
) {
  const expected = createRuntimeActivationFingerprint(input);
  if (
    canonicalJson(activation) !== canonicalJson(expected) ||
    canonicalJson(manifest.activationFingerprint) !== canonicalJson(expected)
  )
    return yield* Effect.fail(
      cliAdapterError(
        "start.built",
        new Error("Built activation fingerprint does not match its artifacts."),
      ),
    );
  if (!input.manifestSource.includes(`manifestGraphHash = ${JSON.stringify(input.graphHash)}`)) {
    return yield* Effect.fail(
      cliAdapterError(
        "start.built",
        new Error("Built runtime manifest hash does not match the graph."),
      ),
    );
  }
});

/**
 * Reads an owned artifact while retaining the established missing-build message.
 * @param root - Build root.
 * @param path - Manifest-owned fixed relative path.
 * @param label - Diagnostic artifact kind.
 * @returns Original bytes or a typed missing/native failure.
 */
const readArtifactEffect = Effect.fn("BuiltProject.artifact")(
  function* (root: string, path: string, label: string) {
    return yield* (yield* CliFileSystem).readText(join(root, path)).pipe(
      Effect.mapError((error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? cliAdapterError(
              "start.artifact",
              new Error(`Built ${label} is missing; rebuild with \`relkit build\`.`),
            )
          : error;
      }),
    );
  },
  (effect) => observeCli("start.built.artifact", effect),
);
