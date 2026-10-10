/**
 * Defines the bounded, portable cache record shared by an explicit development
 * check and finite snapshot preparation. It contains compiler output and input
 * identities, but never diagnostics, environment values, or absolute roots.
 */
import { LoadedToolingConfigSchema } from "@relkit/compiler";
import { Schema } from "effect";
import {
  SnapshotHash,
  SnapshotMember,
  SnapshotTools,
  SnapshotTypecheckInputs,
} from "./snapshot.schemas.js";

const ReceiptText = Schema.String.check(Schema.isMaxLength(67_108_864));

/** Compiler outputs required to build without evaluating authored modules again. */
export const SnapshotCheckOutputs = Schema.Struct({
  graph: ReceiptText,
  manifest: ReceiptText.pipe(Schema.check(Schema.isMinLength(1))),
  runtimeActivation: ReceiptText,
  runtimeIntegrations: ReceiptText,
  runtimeIntegrationImports: ReceiptText,
  localServices: ReceiptText,
  diagnostics: ReceiptText,
  jobsManifest: Schema.optionalKey(ReceiptText),
  openapi: ReceiptText,
  client: ReceiptText,
  contract: ReceiptText,
  clientContract: ReceiptText,
  clientRegistry: ReceiptText,
  clientManifest: ReceiptText,
});

/** Root-free compiler configuration reconstructed against the current project. */
export const SnapshotCheckConfig = Schema.Struct({
  source: LoadedToolingConfigSchema.fields.source,
  exclude: LoadedToolingConfigSchema.fields.exclude,
  generatedDirectory: LoadedToolingConfigSchema.fields.generatedDirectory,
  server: LoadedToolingConfigSchema.fields.server,
  inspector: LoadedToolingConfigSchema.fields.inspector,
  deployment: LoadedToolingConfigSchema.fields.deployment,
});

/** Successful development check evidence eligible for exact current-input reuse. */
export const SnapshotCheckReceipt = Schema.Struct({
  version: Schema.Literal(1),
  fingerprint: SnapshotHash,
  graphHash: SnapshotHash,
  tools: SnapshotTools,
  inputs: Schema.Array(SnapshotMember).check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
  typecheckInputs: SnapshotTypecheckInputs,
  outputs: SnapshotCheckOutputs,
  config: SnapshotCheckConfig,
});
