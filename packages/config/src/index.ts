export { defineEnv, env, isEnvRef } from "./env.js";
export { isBindingValueRef } from "@relkit/provider";
export type {
  BindingValueRef,
  EnvBuilder,
  EnvBuilderBase,
  EnvBuilderFactory,
  EnvDefinition,
  EnvMetadata,
  EnvMetadataMap,
  EnvShape,
  EnvValueType,
  EnvRef,
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
