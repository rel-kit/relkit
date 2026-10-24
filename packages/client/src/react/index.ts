/**
 * Exposes React providers and hooks backed by the selected query adapter. Install
 * react, @tanstack/react-query@^5, @tanstack/query-core@^5 and
 * @orpc/tanstack-query@2.0.0-beta.31 alongside @relkit/client for this entrypoint.
 * TypeScript consumers also install @types/react for React's public types.
 */
export * from "./context.js";
export * from "./agent-hook.js";
export * from "./agent-reconcile.js";
export * from "./finite-hooks.js";
export * from "./job-hooks.js";
export * from "./keys.js";
export * from "./pending.js";
export * from "./realtime-hook.js";
export * from "./registry.js";
export * from "./stream-hook.js";
export type { CountPresence, MemberPresence } from "@relkit/realtime";
export type {
  JobContract,
  JobClientField,
  JobCancelInput,
  JobCancelInputFor,
  JobCancelName,
  JobCancelOutputFor,
  JobFor,
  JobGetInput,
  JobListQuery,
  JobListInput,
  JobProcedureSelector,
  JobProcedureContract,
  JobRegistry,
  JobRetryInput,
  JobRetryInputFor,
  JobRetryName,
  JobRetryOutputFor,
  JobRunSelector,
  JobSelector,
  JobSnapshotFor,
  JobRunFor,
  JobStreamInput,
  JobStreamProcedureContract,
  JobTriggerInput,
  JobTriggerInputFor,
  JobTriggerName,
  JobTriggerOutputFor,
  JobTriggerOptions,
  JobTriggerSelector,
  JobWatchInput,
  JobWatchFrameFor,
  JobWatchName,
  SelectedJobField,
} from "../jobs/index.js";
