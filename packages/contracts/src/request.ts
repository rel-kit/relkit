/** The framework-neutral request surface exposed to function handlers. */
export interface FunctionRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: {
    readonly get: (name: string) => string | null;
  };
  readonly body: unknown;
  readonly bodyUsed: boolean;
  readonly clone: () => FunctionRequest;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
}
