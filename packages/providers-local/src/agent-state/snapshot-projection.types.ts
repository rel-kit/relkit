/** Defines projected public messages and the indexed tool slots used during journal replay. */
import type { AgentExecutionSnapshot, ThreadSnapshot } from "@relkit/contracts";

/** Browser-visible messages, approvals and execution summary derived from the journal. */
export type Projection = Pick<ThreadSnapshot, "values" | "output" | "executions">;

/** Mutable execution accumulator used only while replaying a journal. */
export type MutableExecution = Omit<AgentExecutionSnapshot, "status"> & {
  status?: AgentExecutionSnapshot["status"];
};
