import type { Effect } from "effect";
import type {
  generateClientEffect,
  generateClientContractDocumentEffect,
  generateClientManifestEffect,
  generateClientRegistryEffect,
  generateContractEffect,
} from "@relkit/client-generator";
import type { generateOpenApiJsonEffect } from "@relkit/openapi";
import type { GraphCompilationFailure } from "./normalize-graph.types.js";
import type { JobsManifestGenerationFailure } from "./jobs/manifest.types.js";
import type { RuntimeIntegrationImportFailure } from "./runtime-integration-errors.js";
import type { ActivationFingerprintError } from "./activation-fingerprint.js";

/** Typed failures from the public graph, client, and OpenAPI generation operations. */
export type CompilerGenerationFailure =
  | GraphCompilationFailure
  | JobsManifestGenerationFailure
  | RuntimeIntegrationImportFailure
  | ActivationFingerprintError
  | Effect.Error<ReturnType<typeof generateClientEffect>>
  | Effect.Error<ReturnType<typeof generateClientContractDocumentEffect>>
  | Effect.Error<ReturnType<typeof generateClientManifestEffect>>
  | Effect.Error<ReturnType<typeof generateClientRegistryEffect>>
  | Effect.Error<ReturnType<typeof generateContractEffect>>
  | Effect.Error<ReturnType<typeof generateOpenApiJsonEffect>>;
