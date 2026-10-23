/** Replaceable loader for the optional DeepAgents runtime dependency. */
export interface DeepAgentsLoaderService {
  /** Loads the optional runtime module.
   * @returns The DeepAgents module.
   * @example await loader.load();
   */
  readonly load: () => Promise<typeof import("deepagents")>;
}
