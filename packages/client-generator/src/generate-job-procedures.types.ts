import type { JOB_PROCEDURE_OPERATIONS } from "./generate-job-sources.js";

/** Supported public job procedure names.
 * @example const operation: JobProcedureOperation = "trigger";
 */
export type JobProcedureOperation = (typeof JOB_PROCEDURE_OPERATIONS)[number];

/** Public job metadata used to generate client types and procedure contracts.
 * @example const source: JobProcedureSource = { name: "exportOrders", jobId: "orders.export", taskId: "orders.export", taskVersion: "1", input: {}, output: {}, operations: ["trigger"], fields: [], streamNames: [] };
 */
export interface JobProcedureSource {
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly errors?: unknown;
  readonly progress?: unknown;
  readonly streams?: unknown;
  readonly operations: readonly JobProcedureOperation[];
  readonly fields: readonly string[];
  readonly streamNames: readonly string[];
}
export type { ApplicationGraph } from "@relkit/graph";

/** Serialized job source with stable path metadata.
 * @example const document: JobProcedureDocument = jobProcedureDocument(source);
 */
export interface JobProcedureDocument extends JobProcedureSource {
  readonly procedurePaths?: Readonly<Partial<Record<JobProcedureOperation, readonly string[]>>>;
}
