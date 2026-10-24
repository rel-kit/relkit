/** One model requested RELKIT tool call. */
export interface AgentToolCall {
  readonly callId: string;
  readonly toolId: string;
  readonly input: unknown;
}
