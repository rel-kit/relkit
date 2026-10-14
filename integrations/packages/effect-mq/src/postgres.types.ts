/** Describes the complete native Drizzle PostgreSQL schema used by the scoped effect-mq integration. */
import type {
  mqJobs,
  mqJobAttempts,
  mqSchedules,
  mqQueueControl,
  mqDedupe,
  mqFlowChildren,
  mqFlowOutbox,
} from "effect-mq/drizzle-postgres";

/** Native table handles retain the SDK's exact row, query and foreign-key contracts. */
export interface EffectMqPostgresSchema {
  /** Durable job state and acceptance metadata. */
  readonly jobs: ReturnType<typeof mqJobs>;
  /** Ordered native attempt ledger. */
  readonly attempts: ReturnType<typeof mqJobAttempts>;
  /** Provider-owned schedule definitions and next occurrences. */
  readonly schedules: ReturnType<typeof mqSchedules>;
  /** Native queue pause controls. */
  readonly queues: ReturnType<typeof mqQueueControl>;
  /** Native deduplication keys and windows. */
  readonly dedupe: ReturnType<typeof mqDedupe>;
  /** Durable child-flow admission and completion state. */
  readonly flowChildren: ReturnType<typeof mqFlowChildren>;
  /** Provider-owned parent-flow completion outbox. */
  readonly flowOutbox: ReturnType<typeof mqFlowOutbox>;
}
