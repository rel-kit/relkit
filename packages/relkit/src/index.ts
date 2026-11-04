/**
 * The application API: the Promise-based functions and the types an application writes against.
 * Every other export lives on its `relkit/<area>` subpath, and the Effect form of each API lives in
 * `relkit/effect`. `tests/app/root-exports.test.ts` records this list.
 */

// Application and configuration
export { defineApp, defineConstants, definePrompt, defineEnv, env } from "./app/index.js";
export type {
  ApplicationDescriptor,
  ConstantsDescriptor,
  DefineAppOptions,
  EnvDefinition,
  EnvRef,
  InferEnvValues,
  JsonValue,
  PromptDescriptor,
  ResolvedEnv,
} from "./app/index.js";

// Code outside function handlers
export { getRelkit } from "./app/index.js";
export type { RelkitHandle } from "./app/index.js";

// Functions and errors
export { DeclaredError, defineError, defineFunction, fail, streamOf } from "./app/index.js";
export type {
  AuthContext,
  DeclaredErrorOf,
  DeclaredErrorsOf,
  DefineErrorOptions,
  DefineFunctionOptions,
  ErrorDescriptor,
  ErrorHttpMapping,
  ErrorRetry,
  FunctionContext,
  FunctionDependencies,
  FunctionDescriptor,
  FunctionFailure,
  FunctionHandlerResult,
  FunctionRef,
  InvocationMetadata,
  PublicClock,
  PublicLogger,
  StreamOutputSchema,
} from "./app/index.js";

// Clients a function reaches through its context
export type {
  AgentClientFor,
  BucketClientFor,
  CacheClientFor,
  EventClientFor,
  JobClientFor,
  TaskClientFor,
} from "./app/index.js";

// Services
export { defineService } from "./app/index.js";
export type { DefineServiceOptions, ServiceDescriptor, ServiceRef } from "./app/index.js";

// Routes and middleware
export {
  defineMiddleware,
  defineRequestTransform,
  defineRoute,
  defineServiceRoutes,
  defineTransform,
  http,
} from "./app/index.js";
export type {
  DefineTransformOptions,
  FunctionRouteOptions,
  HttpMethod,
  MiddlewareContext,
  MiddlewareDescriptor,
  MiddlewareHandler,
  RawHttpHandler,
  RawRouteOptions,
  RouteCookie,
  RouteDescriptor,
  RouteRateLimit,
  RouteResponseInit,
  ServiceRoutesOptions,
} from "./app/index.js";

// Events
export { defineEvent, defineEventFunction } from "./app/index.js";
export type {
  DefineEventFunctionOptions,
  DefineEventOptions,
  EventDescriptor,
  EventEnvelope,
  EventFunctionContext,
  EventFunctionDescriptor,
  EventPublishOptions,
  EventPublishResult,
} from "./app/index.js";

// Tasks and jobs
export { defineJob, defineTask } from "./app/index.js";
export type {
  DefineJobOptions,
  DefineTaskOptions,
  DurationInput,
  JobDescriptor,
  JobEnqueueOptions,
  JobEnqueueResult,
  ScheduleDefinition,
  TaskContext,
  TaskDescriptor,
  TaskHandler,
  TaskRetryPolicy,
  TaskTriggerOptions,
} from "./app/index.js";

// Realtime
export { defineChannel } from "./app/index.js";
export type {
  ChannelDescriptor,
  ChannelTriggerOptions,
  DefineChannelOptions,
  TriggerReceipt,
} from "./app/index.js";

// Buckets and cache
export { defineBucket, defineCache } from "./app/index.js";
export type {
  BucketClient,
  BucketDescriptor,
  BucketObjectMetadata,
  BucketPutOptions,
  CacheClient,
  CacheDescriptor,
  DefineBucketOptions,
  DefineCacheOptions,
} from "./app/index.js";

// Tools and agents
export { defineAgent, defineTool } from "./app/index.js";
export type {
  AgentDescriptor,
  AgentLimits,
  ApprovalPolicy,
  DefineAgentOptions,
  DefineToolOptions,
  ToolApproval,
  ToolDescriptor,
  ToolSideEffect,
} from "./app/index.js";
