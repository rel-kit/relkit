import type { StoredLocalBucketObject } from "./types.js";

/** Native filesystem operations for one owned bucket root. */
export interface LocalBucketStorage {
  readonly root: string;
  readonly objectRoot: string;
  readonly read: (key: string) => Promise<StoredLocalBucketObject | undefined>;
  readonly write: (value: StoredLocalBucketObject) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly list: () => Promise<readonly StoredLocalBucketObject[]>;
  readonly ready: () => Promise<void>;
}
