/** Shared span lifetime operations retained until stream settlement. */
export interface InvocationExecution {
  run<A>(callback: () => A): A;
  complete(outcome: string, error?: unknown): void;
}
