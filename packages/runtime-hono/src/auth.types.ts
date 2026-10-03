/** Contract for http auth invocation used by auth. */
export interface HttpAuthInvocation {
  readonly getSession: (options?: { readonly fresh?: boolean }) => Promise<unknown | null>;
}

/** Contract for http auth runtime used by auth. */
export interface HttpAuthRuntime {
  readonly protected: readonly string[];
  readonly publicPaths: readonly string[];
  readonly contextFor: (request: Request) => HttpAuthInvocation;
  readonly protects: (path: string) => boolean;
}

/** create http auth runtime options configuring dependencies, callbacks and runtime policy. */
export interface CreateHttpAuthRuntimeOptions {
  readonly protected: readonly string[];
  readonly publicPaths: readonly string[];
  readonly getSession: (headers: Headers) => Promise<unknown | null>;
}
