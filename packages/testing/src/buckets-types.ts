import type {
  BucketClient,
  BucketObjectMetadata,
  BucketProvider,
  BucketPutOptions,
} from "@zsys/buckets";
import type { TestFailureControls } from "./fakes.js";

export interface TestBucketFakeOptions {
  readonly bucketId?: string;
  readonly ownerId?: string;
  readonly stateRoot?: string;
  readonly clock?: () => number;
  readonly failures?: TestFailureControls;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface TestBucketObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly metadata: BucketObjectMetadata;
}

export interface TestBucketFake extends BucketClient {
  readonly capabilities: { readonly signedReadUrl: false; readonly signedWriteUrl: false };
  readonly provider: BucketProvider;
  readonly client: BucketClient;
  readonly stateRoot: string;
  readonly seed: (key: string, bytes: Uint8Array, options?: BucketPutOptions) => Promise<void>;
  readonly read: (key: string) => Promise<Uint8Array | undefined>;
  readonly inspect: () => readonly TestBucketObject[];
  readonly clear: () => void;
  readonly close: () => Promise<void>;
}
