export { defineEnv, env } from "./env.js";
export type {
  EnvBuilder,
  EnvBuilderBase,
  EnvBuilderFactory,
  EnvDefinition,
  EnvMetadata,
  EnvMetadataMap,
  EnvShape,
  EnvValueType,
  InferEnvValue,
  InferEnvValues,
  JsonValue,
  LiteralValue,
} from "./env.js";
export { EnvResolutionError, projectEnv, resolveEnv } from "./resolve.js";
export type {
  EnvIssue,
  EnvProjection,
  EnvSource,
  ResolveEnvOptions,
  ResolvedEnv,
} from "./resolve.js";
