import type {
  BucketClient,
  BucketObjectMetadata,
  BucketProvider,
  BucketPutOptions,
} from "@relkit/buckets";
import type { TestFailureControls } from "./fakes.js";

/** Bucket write policy and explicit clock, root and failure dependencies. */
export interface TestBucketFakeOptions {
  readonly bucketId?: string;
  readonly ownerId?: string;
  readonly stateRoot?: string;
  readonly clock?: () => number;
  readonly failures?: TestFailureControls;
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

/** Detached native bucket bytes and metadata selected by a stable key. */
export interface TestBucketObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly metadata: BucketObjectMetadata;
}

/** Owned native bucket client with deterministic transfer and inspection controls. */
export interface TestBucketFake extends BucketClient {
  readonly capabilities: { readonly signedReadUrl: false; readonly signedWriteUrl: false };
  readonly provider: BucketProvider;
  readonly client: BucketClient;
  readonly stateRoot: string;
  readonly seed: (key: string, bytes: Uint8Array, options?: BucketPutOptions) => Promise<void>;
  readonly read: (key: string) => Promise<Uint8Array | undefined>;
  readonly inspect: () => readonly TestBucketObject[];
  readonly snapshot: () => import("./bucket-storage.types.js").BucketStorageSnapshot;
  readonly restore: (snapshot: unknown) => void;
  readonly clear: () => void;
  readonly close: () => Promise<void>;
}
