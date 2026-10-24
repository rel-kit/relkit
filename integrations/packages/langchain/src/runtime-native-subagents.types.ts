/** Native nested subagent declaration consumed by DeepAgents construction. */
export interface NativeNestedSubagent {
  readonly name: string;
  readonly description: string;
  readonly runnable: ReturnType<typeof import("deepagents").createDeepAgent>;
}
