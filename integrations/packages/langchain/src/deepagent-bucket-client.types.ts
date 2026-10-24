/** Defines the SDK-independent bucket IO boundary shared by ordinary runtime options and DeepAgents backends. */

/** Bucket client and prefix bound to one DeepAgents backend. */
export interface DeepAgentBucketContext {
  readonly bucket: DeepAgentBucketClient;
  readonly prefix: string;
}

/** Metadata needed to expose a bucket object as a virtual file. */
export interface DeepAgentBucketMetadata {
  readonly contentType?: string;
  readonly size?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** IO operations required by the DeepAgents bucket bridge. */
export interface DeepAgentBucketClient {
  readonly put: (
    key: string,
    bytes: Uint8Array,
    options?: {
      readonly contentType?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    },
  ) => Promise<void>;
  readonly get: (key: string) => Promise<Uint8Array | undefined>;
  readonly head: (key: string) => Promise<DeepAgentBucketMetadata | undefined>;
  readonly delete: (key: string) => Promise<void>;
  readonly exists: (key: string) => Promise<boolean>;
  readonly list: (prefix?: string) => Promise<readonly string[]>;
}
